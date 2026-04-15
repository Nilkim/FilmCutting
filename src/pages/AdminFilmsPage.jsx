import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { KoreanSafeInput, KoreanSafeTextarea } from '../components/KoreanSafeInput';
import './AdminFilmsPage.css';

const BUCKET = 'film-previews';

// Parse a public URL from the film-previews bucket back to its storage path.
// Returns null if the URL is not a storage URL we manage.
function storagePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.substring(idx + marker.length));
}

const emptyForm = {
  name: '',
  color_hex: '#000000',
  price_per_500: 0,
  category: '',
  description: '',
  is_active: true,
  display_order: 0,
};

function AdminFilmsPage() {
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFilm, setEditingFilm] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('films')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      setFilms([]);
    } else {
      setFilms(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAddModal = () => {
    setEditingFilm(null);
    setModalOpen(true);
  };

  const openEditModal = (film) => {
    setEditingFilm(film);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingFilm(null);
  };

  const toggleActive = async (film) => {
    const { error: err } = await supabase
      .from('films')
      .update({ is_active: !film.is_active })
      .eq('id', film.id);
    if (err) {
      alert('활성 상태 변경 실패: ' + err.message);
      return;
    }
    fetchAll();
  };

  const deleteFilm = async (film) => {
    if (!window.confirm(`"${film.name}" 필름을 삭제하시겠습니까?`)) return;

    // Delete preview image from storage if present
    const storagePath = storagePathFromPublicUrl(film.preview_image_url);
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }

    const { error: err } = await supabase.from('films').delete().eq('id', film.id);
    if (err) {
      alert('삭제 실패: ' + err.message);
      return;
    }
    fetchAll();
  };

  return (
    <div className="admin-films-page">
      <div className="admin-films-header">
        <h1>필름 관리</h1>
        <button className="admin-btn admin-btn-primary" onClick={openAddModal}>
          + 새 필름 추가
        </button>
      </div>

      {loading && <div className="status-text">불러오는 중...</div>}
      {error && <div className="status-text" style={{ color: '#ef4444' }}>오류: {error}</div>}

      {!loading && !error && (
        <div className="admin-table-scroll">
        <table className="admin-films-table">
          <thead>
            <tr>
              <th>미리보기</th>
              <th>이름</th>
              <th>색상</th>
              <th>가격 (0.5m당)</th>
              <th>카테고리</th>
              <th>활성</th>
              <th>정렬</th>
              <th>작업</th>
            </tr>
          </thead>
          <tbody>
            {films.length === 0 && (
              <tr>
                <td colSpan={8} className="status-text">등록된 필름이 없습니다.</td>
              </tr>
            )}
            {films.map((film) => (
              <tr key={film.id} className={film.is_active ? '' : 'inactive'}>
                <td>
                  {film.preview_image_url ? (
                    <img src={film.preview_image_url} alt={film.name} className="preview-thumb" />
                  ) : (
                    <div className="preview-thumb" />
                  )}
                </td>
                <td>{film.name}</td>
                <td>
                  <span className="color-swatch" style={{ background: film.color_hex }} />
                  <code>{film.color_hex}</code>
                </td>
                <td>{film.price_per_500?.toLocaleString()}원</td>
                <td>{film.category || '-'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={!!film.is_active}
                    onChange={() => toggleActive(film)}
                  />
                </td>
                <td>{film.display_order}</td>
                <td>
                  <div className="row-actions">
                    <button className="admin-btn" onClick={() => openEditModal(film)}>
                      수정
                    </button>
                    <button className="admin-btn admin-btn-danger" onClick={() => deleteFilm(film)}>
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {modalOpen && (
        <FilmFormModal
          film={editingFilm}
          onClose={closeModal}
          onSaved={() => {
            closeModal();
            fetchAll();
          }}
        />
      )}
    </div>
  );
}

// Upload strategy: insert-then-upload.
// For new films we first insert the row (without preview_image_url) to get the
// generated UUID, then upload to `{id}/{timestamp}-{filename}`, then update the
// row with the resulting public URL. This keeps storage paths tied to stable IDs.
function FilmFormModal({ film, onClose, onSaved }) {
  const isEdit = !!film;
  const [form, setForm] = useState(() => {
    if (!film) return { ...emptyForm };
    return {
      name: film.name || '',
      color_hex: film.color_hex || '#000000',
      price_per_500: film.price_per_500 ?? 0,
      category: film.category || '',
      description: film.description || '',
      is_active: !!film.is_active,
      display_order: film.display_order ?? 0,
    };
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const localFileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    return () => { if (localFileUrl) URL.revokeObjectURL(localFileUrl); };
  }, [localFileUrl]);

  const previewUrl = localFileUrl || (isEdit ? film?.preview_image_url : null);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg('');

    // Validation
    if (!form.name.trim()) {
      setErrMsg('이름을 입력하세요.');
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(form.color_hex)) {
      setErrMsg('색상은 #RRGGBB 형식이어야 합니다.');
      return;
    }
    const price = parseInt(form.price_per_500, 10);
    if (Number.isNaN(price) || price < 0) {
      setErrMsg('가격을 올바르게 입력하세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        color_hex: form.color_hex,
        price_per_500: price,
        category: form.category.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
        display_order: parseInt(form.display_order, 10) || 0,
      };

      let filmId = film?.id;
      let previewUrl = film?.preview_image_url || null;
      const oldPreviewUrl = film?.preview_image_url || null;

      if (isEdit) {
        const { error: upErr } = await supabase.from('films').update(payload).eq('id', filmId);
        if (upErr) throw upErr;
      } else {
        const { data, error: insErr } = await supabase
          .from('films')
          .insert(payload)
          .select()
          .single();
        if (insErr) throw insErr;
        filmId = data.id;
      }

      // Upload new image if provided
      if (file) {
        const safeName = file.name.replace(/[^\w.\-]+/g, '_');
        const path = `${filmId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        previewUrl = pub.publicUrl;

        const { error: urlErr } = await supabase
          .from('films')
          .update({ preview_image_url: previewUrl })
          .eq('id', filmId);
        if (urlErr) throw urlErr;

        // Delete old image if replacing
        const oldPath = storagePathFromPublicUrl(oldPreviewUrl);
        if (oldPath && oldPath !== path) {
          await supabase.storage.from(BUCKET).remove([oldPath]);
        }
      }

      onSaved();
    } catch (err) {
      setErrMsg(err.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal">
        <h2>{isEdit ? '필름 수정' : '새 필름 추가'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>이름 *</label>
            <KoreanSafeInput
              type="text"
              value={form.name}
              onChange={(v) => setField('name', v)}
              required
            />
          </div>

          <div className="form-row">
            <label>미리보기 이미지</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {previewUrl && (
              <img
                src={previewUrl}
                alt="미리보기"
                className="preview-thumb"
                style={{ width: 120, height: 120, marginTop: 8 }}
              />
            )}
          </div>

          <div className="form-row">
            <label>대표 색상 *</label>
            <div className="color-field">
              <input
                type="color"
                value={form.color_hex}
                onChange={(e) => setField('color_hex', e.target.value)}
              />
              <input
                type="text"
                value={form.color_hex}
                onChange={(e) => setField('color_hex', e.target.value)}
                placeholder="#RRGGBB"
                style={{ flex: 1 }}
              />
            </div>
          </div>

          <div className="form-row">
            <label>가격 (0.5m당, 원) *</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.price_per_500}
              onChange={(e) => setField('price_per_500', e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <label>카테고리</label>
            <KoreanSafeInput
              type="text"
              value={form.category}
              onChange={(v) => setField('category', v)}
            />
          </div>

          <div className="form-row">
            <label>설명</label>
            <KoreanSafeTextarea
              value={form.description}
              onChange={(v) => setField('description', v)}
            />
          </div>

          <div className="form-row">
            <label>정렬 순서</label>
            <input
              type="number"
              step="1"
              value={form.display_order}
              onChange={(e) => setField('display_order', e.target.value)}
            />
          </div>

          <div className="form-row checkbox-row">
            <input
              id="is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField('is_active', e.target.checked)}
            />
            <label htmlFor="is_active">활성 여부</label>
          </div>

          {errMsg && <div className="form-error">{errMsg}</div>}

          <div className="modal-actions">
            <button type="button" className="admin-btn" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={saving}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminFilmsPage;
