import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useFilms() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchFilms = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('films')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      setError(error);
      setFilms([]);
    } else {
      const mapped = (data || []).map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color_hex,
        pricePer500: row.price_per_500,
        previewImageUrl: row.preview_image_url,
        category: row.category,
        description: row.description,
      }));
      setFilms(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFilms();
  }, [fetchFilms]);

  return { films, loading, error, refetch: fetchFilms };
}
