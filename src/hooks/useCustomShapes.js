import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// 관리자가 등록한 비정형 도형(DXF 임포트 결과) 카탈로그를 불러온다.
// useFilms와 동일한 패턴 — 활성 항목만 가져오고 snake↔camel 매핑.
export function useCustomShapes() {
  const [customShapes, setCustomShapes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCustomShapes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('custom_shapes')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      setError(error);
      setCustomShapes([]);
    } else {
      const mapped = (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        pathData: row.path_data,
        baseWidth: Number(row.base_width),
        baseHeight: Number(row.base_height),
        previewImageUrl: row.preview_image_url,
        category: row.category,
      }));
      setCustomShapes(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomShapes();
  }, [fetchCustomShapes]);

  return { customShapes, loading, error, refetch: fetchCustomShapes };
}
