// client/components/admin/manual-quote/ManualQuoteFilesStep.tsx

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { HITLFileList } from '../hitl-file-list';
import { FileTotals } from '../hitl-file-list/types';

interface Language {
  id: string;
  code: string;
  name: string;
  native_name: string;
  is_source_available: boolean;
  is_target_available: boolean;
}

interface IntendedUse {
  id: string;
  name: string;
  code: string;
}

export interface TranslationSettings {
  sourceLanguageId: string | null;
  targetLanguageId: string | null;
  intendedUseId: string | null;
  countryOfIssue?: string;
  specialInstructions?: string;
}

interface ManualQuoteFilesStepProps {
  quoteId: string;
  value: TranslationSettings;
  onChange: (settings: TranslationSettings) => void;
  onTotalsChange?: (totals: FileTotals) => void;
}

export default function ManualQuoteFilesStep({
  quoteId,
  value,
  onChange,
  onTotalsChange,
}: ManualQuoteFilesStepProps) {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [intendedUses, setIntendedUses] = useState<IntendedUse[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Fetch reference data
  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [langResult, useResult] = await Promise.all([
          supabase.from('languages').select('*').eq('is_active', true).order('name'),
          supabase.from('intended_uses').select('*').eq('is_active', true).order('sort_order'),
        ]);
        if (langResult.data) setLanguages(langResult.data);
        if (useResult.data) setIntendedUses(useResult.data);
      } catch (err) {
        console.error('Failed to fetch reference data:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchData();
  }, []);

  // Load existing quote settings on mount
  useEffect(() => {
    const loadQuoteSettings = async () => {
      if (!quoteId) return;

      const { data, error } = await supabase
        .from('quotes')
        .select('source_language_id, target_language_id, intended_use_id, special_instructions')
        .eq('id', quoteId)
        .single();

      if (error) {
        console.error('Failed to load quote settings:', error);
        return;
      }

      if (data) {
        // Only update if we don't already have values (don't override user changes)
        const shouldUpdate = !value.sourceLanguageId && !value.targetLanguageId && !value.intendedUseId;
        if (shouldUpdate && (data.source_language_id || data.target_language_id || data.intended_use_id)) {
          onChange({
            sourceLanguageId: data.source_language_id || null,
            targetLanguageId: data.target_language_id || null,
            intendedUseId: data.intended_use_id || null,
            specialInstructions: data.special_instructions || '',
          });
        }
      }
    };

    loadQuoteSettings();
  }, [quoteId]);

  // Save translation settings to quote
  const saveSettings = async (field: string, val: string) => {
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {};

      if (field === 'sourceLanguageId') updateData.source_language_id = val || null;
      if (field === 'targetLanguageId') updateData.target_language_id = val || null;
      if (field === 'intendedUseId') updateData.intended_use_id = val || null;
      if (field === 'specialInstructions') updateData.special_instructions = val;

      const { error } = await supabase
        .from('quotes')
        .update(updateData)
        .eq('id', quoteId);

      if (error) throw error;
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof TranslationSettings, val: string) => {
    onChange({ ...value, [field]: val || null });
    saveSettings(field, val);
  };

  const sourceLanguages = languages.filter(l => l.is_source_available);
  const targetLanguages = languages.filter(l => l.is_target_available);

  if (loadingData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Translation Settings Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">Translation Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Source Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source Language <span className="text-red-500">*</span>
            </label>
            <select
              value={value.sourceLanguageId || ''}
              onChange={(e) => handleChange('sourceLanguageId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            >
              <option value="">Select source language...</option>
              {sourceLanguages.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.name} ({lang.code})
                </option>
              ))}
            </select>
          </div>

          {/* Target Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Language <span className="text-red-500">*</span>
            </label>
            <select
              value={value.targetLanguageId || ''}
              onChange={(e) => handleChange('targetLanguageId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            >
              <option value="">Select target language...</option>
              {targetLanguages.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.name} ({lang.code})
                </option>
              ))}
            </select>
          </div>

          {/* Intended Use */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Intended Use <span className="text-red-500">*</span>
            </label>
            <select
              value={value.intendedUseId || ''}
              onChange={(e) => handleChange('intendedUseId', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={saving}
            >
              <option value="">Select intended use...</option>
              {intendedUses.map(use => (
                <option key={use.id} value={use.id}>
                  {use.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Language pair summary */}
        {value.sourceLanguageId && value.targetLanguageId && (
          <div className="mt-4 p-3 bg-white border border-blue-100 rounded-md">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Translation Direction:</span>{' '}
              {languages.find(l => l.id === value.sourceLanguageId)?.name || 'Unknown'} →{' '}
              {languages.find(l => l.id === value.targetLanguageId)?.name || 'Unknown'}
            </p>
          </div>
        )}

        {/* Special Instructions (optional) */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Special Instructions (optional)
          </label>
          <textarea
            value={value.specialInstructions || ''}
            onChange={(e) => handleChange('specialInstructions', e.target.value)}
            onBlur={(e) => saveSettings('specialInstructions', e.target.value)}
            placeholder="Any special requirements or notes..."
            rows={2}
            maxLength={1000}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={saving}
          />
          <p className="text-xs text-gray-500 mt-1">
            {(value.specialInstructions || '').length}/1000 characters
          </p>
        </div>

        {saving && (
          <p className="text-sm text-blue-600 mt-2 flex items-center">
            <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2"></span>
            Saving...
          </p>
        )}
      </div>

      {/* File List */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Documents</h3>
        <HITLFileList
          quoteId={quoteId}
          readOnly={false}
          onTotalsChange={onTotalsChange}
        />
      </div>
    </div>
  );
}
