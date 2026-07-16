export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { insforge } from '@/lib/insforge';
import { getUserId } from '@/lib/auth';
import { encryptSecret } from '@/lib/crypto';

export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: settings, error } = await insforge.database
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!settings) {
      // Create default settings
      const { data: newSettings, error: createError } = await insforge.database
        .from('user_settings')
        .insert([{ user_id: userId }])
        .select()
        .single();

      if (createError) {
        console.error('Error creating settings:', createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }

      return NextResponse.json({
        id: newSettings.id,
        userId: newSettings.user_id,
        gmailConnected: false,
        smtpConfigured: false,
        resendConfigured: false,
        dailyLimit: 50,
        warmupEnabled: false,
        warmupCount: 0,
        createdAt: newSettings.created_at,
        updatedAt: newSettings.updated_at,
        aiProvider: 'google',
        openaiCompatibleKey: null,
        openaiCompatibleBaseUrl: '',
        openaiCompatibleModel: '',
        openaiCompatibleThinking: false,
      });
    }

    return NextResponse.json({
      id: settings.id,
      userId: settings.user_id,
      gmailConnected: settings.gmail_connected,
      smtpConfigured: settings.smtp_configured,
      smtpHost: settings.smtp_host,
      smtpPort: settings.smtp_port,
      smtpUser: settings.smtp_user,
      resendConfigured: settings.resend_configured,
      openaiKey: settings.openai_key ? 'configured' : null,
      signature: settings.signature,
      companyName: settings.company_name,
      website: settings.website,
      whatsApp: settings.whats_app,
      linkedInUrl: settings.linked_in_url,
      twitterUrl: settings.twitter_url,
      dailyLimit: settings.daily_limit,
      warmupEnabled: settings.warmup_enabled,
      warmupCount: settings.warmup_count,
      aiProvider: settings.ai_provider || 'google',
      openaiCompatibleKey: settings.openai_compatible_key ? 'configured' : null,
      openaiCompatibleBaseUrl: settings.openai_compatible_base_url || '',
      openaiCompatibleModel: settings.openai_compatible_model || '',
      openaiCompatibleThinking: settings.openai_compatible_thinking || false,
      createdAt: settings.created_at,
      updatedAt: settings.updated_at,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();
    const { clearSmtp, clearResend, clearAi } = data;

    const updateData: any = {};

    if (clearSmtp) {
      updateData.smtp_host = null;
      updateData.smtp_port = null;
      updateData.smtp_user = null;
      updateData.smtp_pass = null;
      updateData.smtp_configured = false;
    }

    if (clearResend) {
      updateData.resend_api_key = null;
      updateData.resend_configured = false;
    }

    if (clearAi) {
      updateData.openai_key = null;
      updateData.openai_compatible_key = null;
      updateData.openai_compatible_base_url = null;
      updateData.openai_compatible_model = null;
      updateData.openai_compatible_thinking = false;
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await insforge.database
        .from('user_settings')
        .update(updateData)
        .eq('user_id', userId);

      if (error) {
        console.error('Error clearing settings:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ message: 'Credentials cleared successfully' });
  } catch (error) {
    console.error('Error clearing credentials:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    // Fetch existing settings to merge passwords and API keys
    const { data: existing } = await insforge.database
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    const updateData: any = {
      smtp_host: data.smtpHost !== undefined ? (data.smtpHost || null) : (existing?.smtp_host || null),
      smtp_port: data.smtpPort !== undefined ? (data.smtpPort ? parseInt(data.smtpPort.toString()) : null) : (existing?.smtp_port || null),
      smtp_user: data.smtpUser !== undefined ? (data.smtpUser || null) : (existing?.smtp_user || null),
      signature: data.signature !== undefined ? (data.signature || null) : (existing?.signature || null),
      company_name: data.companyName !== undefined ? (data.companyName || null) : (existing?.company_name || null),
      website: data.website !== undefined ? (data.website || null) : (existing?.website || null),
      whats_app: data.whatsApp !== undefined ? (data.whatsApp || null) : (existing?.whats_app || null),
      linked_in_url: data.linkedInUrl !== undefined ? (data.linkedInUrl || null) : (existing?.linked_in_url || null),
      twitter_url: data.twitterUrl !== undefined ? (data.twitterUrl || null) : (existing?.twitter_url || null),
      daily_limit: data.dailyLimit !== undefined ? (data.dailyLimit || 50) : (existing?.daily_limit || 50),
      warmup_enabled: data.warmupEnabled !== undefined ? (data.warmupEnabled || false) : (existing?.warmup_enabled || false),
      ai_provider: data.aiProvider !== undefined ? (data.aiProvider || 'google') : (existing?.ai_provider || 'google'),
      openai_compatible_base_url: data.openaiCompatibleBaseUrl !== undefined ? (data.openaiCompatibleBaseUrl || null) : (existing?.openai_compatible_base_url || null),
      openai_compatible_model: data.openaiCompatibleModel !== undefined ? (data.openaiCompatibleModel || null) : (existing?.openai_compatible_model || null),
      openai_compatible_thinking: data.openaiCompatibleThinking !== undefined ? (data.openaiCompatibleThinking === true) : (existing?.openai_compatible_thinking || false),
    };

    // Only update SMTP password if it is provided, non-empty, and not a masked placeholder
    if (data.smtpPass !== undefined && data.smtpPass !== '' && data.smtpPass !== 'configured') {
      updateData.smtp_pass = encryptSecret(data.smtpPass);
    } else {
      updateData.smtp_pass = existing?.smtp_pass || null;
    }

    // Dynamically calculate smtp_configured
    updateData.smtp_configured = !!(updateData.smtp_host && updateData.smtp_user && updateData.smtp_pass);

    // Only update Resend API Key if provided, non-empty, and not a masked placeholder
    if (data.resendApiKey !== undefined && data.resendApiKey !== '' && data.resendApiKey !== 'configured') {
      updateData.resend_api_key = encryptSecret(data.resendApiKey);
      updateData.resend_configured = true;
    } else {
      updateData.resend_api_key = existing?.resend_api_key || null;
      updateData.resend_configured = existing?.resend_configured || false;
    }

    // Only update Gemini API Key (stored as openai_key) if provided, non-empty, and not a masked placeholder
    if (data.openaiKey !== undefined && data.openaiKey !== '' && data.openaiKey !== 'configured') {
      updateData.openai_key = encryptSecret(data.openaiKey);
    } else {
      updateData.openai_key = existing?.openai_key || null;
    }

    // Only update OpenAI Compatible API Key if provided, non-empty, and not a masked placeholder
    if (data.openaiCompatibleKey !== undefined && data.openaiCompatibleKey !== '' && data.openaiCompatibleKey !== 'configured') {
      updateData.openai_compatible_key = encryptSecret(data.openaiCompatibleKey);
    } else {
      updateData.openai_compatible_key = existing?.openai_compatible_key || null;
    }

    if (existing) {
      // Update existing
      const { error } = await insforge.database
        .from('user_settings')
        .update(updateData)
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating settings:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Insert new
      const { error } = await insforge.database
        .from('user_settings')
        .insert([{
          user_id: userId,
          ...updateData,
        }]);

      if (error) {
        console.error('Error creating settings:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}