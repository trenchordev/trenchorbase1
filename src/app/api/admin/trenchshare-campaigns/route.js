import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { cookies } from 'next/headers';

const isTruthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

// Admin authentication check
async function isAdmin() {
  const cookieStore = await cookies();
  const session = cookieStore.get('admin_session');
  return session?.value === 'authenticated';
}

// GET - List all campaigns
export async function GET() {
  try {
    console.log('[TrenchShare] Fetching campaigns...');
    
    if (!await isAdmin()) {
      console.log('[TrenchShare] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[TrenchShare] Admin authenticated, querying Redis...');
    const allKeys = await redis.keys('trenchshare:campaign:*');
    console.log('[TrenchShare] Found all keys:', allKeys);
    
    // Filter out non-campaign keys (like :submissions, :leaderboard, etc)
    const campaignKeys = allKeys.filter(key => {
      const parts = key.split(':');
      // Valid campaign key: trenchshare:campaign:{id}
      // Invalid: trenchshare:campaign:{id}:submissions
      return parts.length === 3;
    });
    console.log('[TrenchShare] Filtered campaign keys:', campaignKeys);
    
    const campaigns = [];

    for (const key of campaignKeys) {
      console.log('[TrenchShare] Fetching campaign:', key);
      const campaign = await redis.hgetall(key);
      console.log('[TrenchShare] Campaign data:', campaign);
      
      if (campaign && campaign.id) {
        // Get participant count
        const submissionKeys = await redis.keys(`trenchshare:submission:${campaign.id}:*`);
        
        campaigns.push({
          id: campaign.id,
          name: campaign.name,
          description: campaign.description || '',
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          maxPosts: parseInt(campaign.maxPosts) || 10,
          imageUrl: campaign.imageUrl || '',
          active: isTruthy(campaign.active),
          participantCount: submissionKeys.length,
          createdAt: campaign.createdAt,
        });
      }
    }

    // Sort by createdAt desc
    campaigns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    console.log('[TrenchShare] Returning campaigns:', campaigns);
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error('[TrenchShare] Error fetching campaigns:', error);
    console.error('[TrenchShare] Error stack:', error.stack);
    return NextResponse.json({ 
      error: 'Failed to fetch campaigns',
      details: error.message 
    }, { status: 500 });
  }
}

// POST - Create new campaign
export async function POST(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, startDate, endDate, maxPosts, imageUrl } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json({ error: 'Name, startDate, and endDate are required' }, { status: 400 });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end <= start) {
      return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 });
    }
    
    // Generate campaign ID
    const id = name.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now();

    const campaign = {
      id,
      name,
      description: description || '',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      maxPosts: (maxPosts || 10).toString(),
      imageUrl: imageUrl || '',
      active: 'true',
      createdAt: new Date().toISOString(),
    };

    await redis.hset(`trenchshare:campaign:${id}`, campaign);

    return NextResponse.json({ 
      success: true, 
      campaign: {
        ...campaign,
        maxPosts: parseInt(campaign.maxPosts),
        active: true,
      }
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}

// PUT - Update campaign
export async function PUT(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, active, name, description, startDate, endDate, maxPosts, imageUrl } = body;

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }

    const key = `trenchshare:campaign:${id}`;
    
    // Get existing campaign
    const existing = await redis.hgetall(key);

    if (!existing || !existing.id) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Build update object
    const updates = {};

    if (active !== undefined) {
      updates.active = active ? 'true' : 'false';
    }
    if (name !== undefined) {
      updates.name = name;
    }
    if (description !== undefined) {
      updates.description = description;
    }
    if (startDate !== undefined) {
      const start = new Date(startDate);
      updates.startDate = start.toISOString();
    }
    if (endDate !== undefined) {
      const end = new Date(endDate);
      updates.endDate = end.toISOString();
    }
    if (maxPosts !== undefined) {
      updates.maxPosts = maxPosts.toString();
    }
    if (imageUrl !== undefined) {
      updates.imageUrl = imageUrl;
    }

    // Update all fields at once
    if (Object.keys(updates).length > 0) {
      await redis.hset(key, updates);
    }

    // Read back to verify
    const updated = await redis.hgetall(key);

    return NextResponse.json({ 
      success: true, 
      campaign: {
        id: updated.id,
        name: updated.name,
        description: updated.description || '',
        startDate: updated.startDate,
        endDate: updated.endDate,
        maxPosts: parseInt(updated.maxPosts) || 10,
        imageUrl: updated.imageUrl || '',
        active: isTruthy(updated.active),
        participantCount: 0,
        createdAt: updated.createdAt,
      }
    });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

// DELETE - Delete campaign
export async function DELETE(request) {
  try {
    if (!await isAdmin()) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 });
    }
    
    // Delete campaign
    await redis.del(`trenchshare:campaign:${id}`);
    
    // Delete all submissions for this campaign
    const submissionKeys = await redis.keys(`trenchshare:submission:${id}:*`);
    if (submissionKeys.length > 0) {
      await redis.del(...submissionKeys);
    }
    
    await redis.del(`trenchshare:campaign:${id}:submissions`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
