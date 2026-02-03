import { useReducer, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  DocumentFlowState,
  DocumentFlowAction,
  QuoteFile,
  DocumentGroup,
  PricingSettings,
  DEFAULT_PRICING_SETTINGS,
  EditorMode,
} from '../types';

const initialState: DocumentFlowState = {
  files: [],
  groups: [],
  categories: [],
  certificationTypes: [],
  documentTypes: [],
  pricingSettings: DEFAULT_PRICING_SETTINGS,
  languageMultiplier: 1.0,
  isLoading: true,
  error: null,
  expandedFileId: null,
  analyzingFileIds: new Set(),
  submittedFileIds: new Set(),
};

function reducer(state: DocumentFlowState, action: DocumentFlowAction): DocumentFlowState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_DATA':
      return { ...state, ...action.payload };
    case 'SET_FILES':
      return { ...state, files: action.payload };
    case 'SET_GROUPS':
      return { ...state, groups: action.payload };
    case 'ADD_FILE':
      return { ...state, files: [...state.files, action.payload] };
    case 'UPDATE_FILE':
      return {
        ...state,
        files: state.files.map(f =>
          f.id === action.payload.id ? { ...f, ...action.payload.updates } : f
        ),
      };
    case 'REMOVE_FILE':
      return { ...state, files: state.files.filter(f => f.id !== action.payload) };
    case 'SET_EXPANDED_FILE':
      return { ...state, expandedFileId: action.payload };
    case 'SET_ANALYZING':
      const newAnalyzing = new Set(state.analyzingFileIds);
      if (action.payload.isAnalyzing) {
        newAnalyzing.add(action.payload.fileId);
      } else {
        newAnalyzing.delete(action.payload.fileId);
      }
      return { ...state, analyzingFileIds: newAnalyzing };
    case 'SET_SUBMITTED':
      const newSubmitted = new Set(state.submittedFileIds);
      if (action.payload.isSubmitted) {
        newSubmitted.add(action.payload.fileId);
      } else {
        newSubmitted.delete(action.payload.fileId);
      }
      return { ...state, submittedFileIds: newSubmitted };
    case 'ADD_GROUP':
      return { ...state, groups: [...state.groups, action.payload] };
    case 'UPDATE_GROUP':
      return {
        ...state,
        groups: state.groups.map(g =>
          g.id === action.payload.id ? { ...g, ...action.payload.updates } : g
        ),
      };
    case 'REMOVE_GROUP':
      return { ...state, groups: state.groups.filter(g => g.id !== action.payload) };
    default:
      return state;
  }
}

export function useDocumentFlow(quoteId: string, mode: EditorMode) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Fetch all data
  const fetchData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      // Fetch files with analysis and pages
      // Note: Must specify foreign key explicitly due to multiple relationships
      const { data: filesData, error: filesError } = await supabase
        .from('quote_files')
        .select(`
          *,
          file_category:file_categories!quote_files_file_category_id_fkey(*),
          analysis:ai_analysis_results(*),
          pages:quote_pages(*)
        `)
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

      if (filesError) throw filesError;

      // Fetch categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('file_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (categoriesError) throw categoriesError;

      // Fetch certification types
      const { data: certTypesData, error: certTypesError } = await supabase
        .from('certification_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (certTypesError) throw certTypesError;

      // Fetch document types
      const { data: docTypesData, error: docTypesError } = await supabase
        .from('document_types')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (docTypesError) throw docTypesError;

      // Fetch pricing settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('app_settings')
        .select('setting_key, setting_value')
        .in('setting_key', [
          'base_rate',
          'words_per_page',
          'min_billable_pages',
          'rounding_precision',
          'complexity_easy',
          'complexity_medium',
          'complexity_hard',
        ]);

      if (settingsError) throw settingsError;

      // Build pricing settings object
      const pricingSettings: PricingSettings = { ...DEFAULT_PRICING_SETTINGS };
      settingsData?.forEach(s => {
        const key = s.setting_key as keyof PricingSettings;
        if (key in pricingSettings) {
          pricingSettings[key] = parseFloat(s.setting_value) || pricingSettings[key];
        }
      });

      // Fetch language multiplier from quote
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select(`
          source_language:languages!quotes_source_language_id_fkey(multiplier)
        `)
        .eq('id', quoteId)
        .single();

      // Handle both array and object responses from Supabase join
      const sourceLanguage = Array.isArray(quoteData?.source_language)
        ? quoteData?.source_language[0]
        : quoteData?.source_language;
      const languageMultiplier = sourceLanguage?.multiplier || 1.0;

      // Fetch document groups with page assignments
      const { data: groupsData, error: groupsError } = await supabase
        .from('quote_document_groups')
        .select(`
          *,
          certification_type:certification_types(*),
          page_assignments:quote_page_group_assignments(
            *,
            page:quote_pages(*),
            file:quote_files(id, original_filename)
          )
        `)
        .eq('quote_id', quoteId)
        .order('group_number', { ascending: true });

      if (groupsError) {
        console.error('Error fetching groups:', groupsError);
        // Don't throw - groups are optional, continue with empty array
      }

      // Transform files data
      const files: QuoteFile[] = (filesData || []).map(f => ({
        ...f,
        analysis: f.analysis?.[0] || undefined,
        pages: f.pages || [],
      }));

      // Transform groups data to match DocumentGroup interface
      const groups: DocumentGroup[] = (groupsData || []).map(g => {
        // Get source file info from first page assignment
        const firstAssignment = g.page_assignments?.[0];
        const sourceFile = firstAssignment?.file;
        const sourceFilename = sourceFile?.original_filename ||
          filesData?.find(f => f.id === firstAssignment?.file_id)?.original_filename ||
          'Unknown';

        // Build pages array from assignments
        const pages = (g.page_assignments || [])
          .filter((pa: any) => pa.page)
          .map((pa: any) => ({
            id: pa.page.id,
            page_number: pa.page.page_number,
            word_count: pa.word_count_override || pa.page.word_count || 0,
            complexity: pa.page.complexity || g.complexity || 'easy',
            complexity_multiplier: pa.page.complexity_multiplier || g.complexity_multiplier || 1.0,
            billable_pages: pa.page.billable_pages || 0,
          }));

        return {
          id: g.id,
          name: g.group_label || `Document ${g.group_number}`,
          document_type: g.document_type || 'Unknown',
          holder_name: g.holder_name || null,
          country_of_issue: g.country_of_issue || null,
          source_file_id: firstAssignment?.file_id || '',
          source_filename: sourceFilename,
          page_ids: (g.page_assignments || []).map((pa: any) => pa.page_id).filter(Boolean),
          pages,
          certification_type_id: g.certification_type_id || '',
          certification_name: g.certification_type?.name || 'Standard',
          certification_price: g.certification_price || g.certification_type?.price || 0,
          total_words: g.total_word_count || 0,
          total_billable_pages: parseFloat(g.billable_pages) || 0,
          translation_cost: parseFloat(g.line_total) - (g.certification_price || 0),
          group_total: parseFloat(g.line_total) || 0,
        };
      });

      dispatch({
        type: 'SET_DATA',
        payload: {
          files,
          groups,
          categories: categoriesData || [],
          certificationTypes: certTypesData || [],
          documentTypes: docTypesData || [],
          pricingSettings,
          languageMultiplier,
          isLoading: false,
        },
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load data' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [quoteId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Actions
  const setExpandedFile = useCallback((fileId: string | null) => {
    dispatch({ type: 'SET_EXPANDED_FILE', payload: fileId });
  }, []);

  const setAnalyzing = useCallback((fileId: string, isAnalyzing: boolean) => {
    dispatch({ type: 'SET_ANALYZING', payload: { fileId, isAnalyzing } });
  }, []);

  const setSubmitted = useCallback((fileId: string, isSubmitted: boolean) => {
    dispatch({ type: 'SET_SUBMITTED', payload: { fileId, isSubmitted } });
  }, []);

  const addFile = useCallback((file: QuoteFile) => {
    dispatch({ type: 'ADD_FILE', payload: file });
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<QuoteFile>) => {
    dispatch({ type: 'UPDATE_FILE', payload: { id, updates } });
  }, []);

  const removeFile = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FILE', payload: id });
  }, []);

  const addGroup = useCallback((group: DocumentGroup) => {
    dispatch({ type: 'ADD_GROUP', payload: group });
  }, []);

  const updateGroup = useCallback((id: string, updates: Partial<DocumentGroup>) => {
    dispatch({ type: 'UPDATE_GROUP', payload: { id, updates } });
  }, []);

  const removeGroup = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_GROUP', payload: id });
  }, []);

  const setGroups = useCallback((groups: DocumentGroup[]) => {
    dispatch({ type: 'SET_GROUPS', payload: groups });
  }, []);

  return {
    state,
    actions: {
      fetchData,
      setExpandedFile,
      setAnalyzing,
      setSubmitted,
      addFile,
      updateFile,
      removeFile,
      addGroup,
      updateGroup,
      removeGroup,
      setGroups,
    },
  };
}
