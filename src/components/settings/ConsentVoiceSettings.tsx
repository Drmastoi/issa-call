import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Volume2, Play, RefreshCw, Save } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface ConsentSetting {
  id: string;
  message_type: string;
  message_text: string;
  voice_id: string;
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  updated_at: string;
}

const VOICE_OPTIONS = [
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice - Warm, Professional Female' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah - Friendly Female' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura - Calm Female' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George - Professional Male' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam - Friendly Male' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel - Clear Male' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily - Gentle Female' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian - Warm Male' },
];

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  greeting: 'Greeting Message',
  recording: 'Recording Disclosure',
  consent_prompt: 'Consent Prompt (Legacy - Button Press)',
  consent_verbal: 'Consent Prompt (Verbal)',
  thank_you: 'Thank You Message',
  declined: 'Declined Message',
  goodbye: 'Goodbye Message',
  no_response: 'No Response Message',
  error: 'Error Message',
  unclear_response: 'Unclear Response Message',
  invalid_input: 'Invalid Input (Legacy)',
};

export function ConsentVoiceSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [playingType, setPlayingType] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState<Record<string, Partial<ConsentSetting>>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['consent-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('consent_settings')
        .select('*')
        .order('message_type');
      if (error) throw error;
      return data as ConsentSetting[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (setting: Partial<ConsentSetting> & { id: string }) => {
      const { error } = await supabase
        .from('consent_settings')
        .update({
          message_text: setting.message_text,
          voice_id: setting.voice_id,
          stability: setting.stability,
          similarity_boost: setting.similarity_boost,
          style: setting.style,
          use_speaker_boost: setting.use_speaker_boost,
          updated_at: new Date().toISOString(),
        })
        .eq('id', setting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-settings'] });
      toast({ title: 'Settings saved successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to save settings', description: error.message });
    },
  });

  const handlePreview = async (messageType: string) => {
    setPlayingType(messageType);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/consent-audio?type=${messageType}`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      
      if (!response.ok) throw new Error('Failed to generate audio');
      
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setPlayingType(null);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setPlayingType(null);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (error) {
      setPlayingType(null);
      toast({ 
        variant: 'destructive', 
        title: 'Failed to preview audio', 
        description: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  };

  const getEditValue = <K extends keyof ConsentSetting>(setting: ConsentSetting, key: K): ConsentSetting[K] => {
    const edit = editingSettings[setting.id];
    if (edit && key in edit) {
      return edit[key] as ConsentSetting[K];
    }
    return setting[key];
  };

  const setEditValue = <K extends keyof ConsentSetting>(settingId: string, key: K, value: ConsentSetting[K]) => {
    setEditingSettings(prev => ({
      ...prev,
      [settingId]: {
        ...prev[settingId],
        [key]: value,
      },
    }));
  };

  const handleSave = (setting: ConsentSetting) => {
    const updates = editingSettings[setting.id] || {};
    updateMutation.mutate({
      id: setting.id,
      message_text: updates.message_text ?? setting.message_text,
      voice_id: updates.voice_id ?? setting.voice_id,
      stability: updates.stability ?? setting.stability,
      similarity_boost: updates.similarity_boost ?? setting.similarity_boost,
      style: updates.style ?? setting.style,
      use_speaker_boost: updates.use_speaker_boost ?? setting.use_speaker_boost,
    });
    // Clear edits for this setting
    setEditingSettings(prev => {
      const { [setting.id]: _, ...rest } = prev;
      return rest;
    });
  };

  const hasChanges = (settingId: string) => {
    return !!editingSettings[settingId] && Object.keys(editingSettings[settingId]).length > 0;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Consent Voice Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Consent Voice Settings
        </CardTitle>
        <CardDescription>
          Customize the voice, speaking style, and message text for consent prompts. 
          Changes will affect all future calls.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {settings?.map((setting) => (
            <AccordionItem key={setting.id} value={setting.id}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4">
                  <span className="font-medium">
                    {MESSAGE_TYPE_LABELS[setting.message_type] || setting.message_type}
                  </span>
                  {hasChanges(setting.id) && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      Unsaved changes
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6 pt-4">
                {/* Message Text */}
                <div className="space-y-2">
                  <Label>Message Text</Label>
                  <Textarea
                    value={getEditValue(setting, 'message_text')}
                    onChange={(e) => setEditValue(setting.id, 'message_text', e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {/* Voice Selection */}
                <div className="space-y-2">
                  <Label>Voice</Label>
                  <Select
                    value={getEditValue(setting, 'voice_id')}
                    onValueChange={(value) => setEditValue(setting.id, 'voice_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {VOICE_OPTIONS.map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {voice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice Settings Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Stability */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Stability</Label>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(getEditValue(setting, 'stability') * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[getEditValue(setting, 'stability')]}
                      onValueChange={([value]) => setEditValue(setting.id, 'stability', value)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher = more consistent, lower = more expressive
                    </p>
                  </div>

                  {/* Similarity Boost */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Similarity</Label>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(getEditValue(setting, 'similarity_boost') * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[getEditValue(setting, 'similarity_boost')]}
                      onValueChange={([value]) => setEditValue(setting.id, 'similarity_boost', value)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      How closely to match original voice
                    </p>
                  </div>

                  {/* Style */}
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Label>Style</Label>
                      <span className="text-sm text-muted-foreground">
                        {Math.round(getEditValue(setting, 'style') * 100)}%
                      </span>
                    </div>
                    <Slider
                      value={[getEditValue(setting, 'style')]}
                      onValueChange={([value]) => setEditValue(setting.id, 'style', value)}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher = more stylized/dramatic
                    </p>
                  </div>
                </div>

                {/* Speaker Boost */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Speaker Boost</Label>
                    <p className="text-xs text-muted-foreground">
                      Enhance clarity and voice similarity
                    </p>
                  </div>
                  <Switch
                    checked={getEditValue(setting, 'use_speaker_boost')}
                    onCheckedChange={(checked) => setEditValue(setting.id, 'use_speaker_boost', checked)}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(setting.message_type)}
                    disabled={playingType === setting.message_type}
                  >
                    {playingType === setting.message_type ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Playing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSave(setting)}
                    disabled={!hasChanges(setting.id) || updateMutation.isPending}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {(!settings || settings.length === 0) && (
          <div className="text-center py-8 text-muted-foreground">
            No consent settings found. They will be created automatically on the first call.
          </div>
        )}
      </CardContent>
    </Card>
  );
}