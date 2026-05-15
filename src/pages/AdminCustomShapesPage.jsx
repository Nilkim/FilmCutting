import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { importDXFtoShapes } from '../utils/dxfExport';
import './AdminFilmsPage.css';
import './AdminCustomShapesPage.css';

// IME-safe text input — defaultValue(uncontrolled) + ref + 조합 중에는
// 외부 value를 DOM에 동기화하지 않는 패턴. KoreanSafeInput보다 더 robust해서
// 부모 리렌더가 잦은 폼에서도 한글 조합이 깨지지 않는다. ShapeSpecEditor의
// 검증된 동일 패턴을 그대로 차용.
function CompositionSafeInput({ value, onChange, ...rest }) {
  const ref = useRef(null);
  const composingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (composingRef.current) return;
    const v = value ?? '';
    if (el.value !== v) el.value = v;
  }, [value]);

  return (
    <input
      ref={ref}
      defaultValue={value ?? ''}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={(e) => {
        composingRef.current = false;
        onChange(e.target.value);
      }}
      onInput={(e) => {
        if (composingRef.current) return;
        onChange(e.target.value);
      }}
      {...rest}
    />
  );
}

const BUCKET = 'custom-shape-previews';

// Same helper as AdminFilmsPage — extract storage path from a public URL so
// we can delete the old preview when replaced.
function storagePathFromPublicUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.substring(idx + marker.length));
}

const emptyForm = {
  name: '',
  category: '',
  is_active: true,
  display_order: 0,
};

function AdminCustomShapesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('custom_shapes')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openAddModal = () => {
    setEditingRow(null);
    setModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditingRow(row);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRow(null);
  };

  const toggleActive = async (row) => {
    const { error: err } = await supabase
      .from('custom_shapes')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    if (err) {
      alert('활성 상태 변경 실패: ' + err.message);
      return;
    }
    fetchAll();
  };

  const deleteRow = async (row) => {
    if (!window.confirm(`"${row.name}" 도형을 삭제하시겠습니까?`)) return;

    const storagePath = storagePathFromPublicUrl(row.preview_image_url);
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }

    const { error: err } = await supabase.from('custom_shapes').delete().eq('id', row.id);
    if (err) {
      alert('삭제 실패: ' + err.message);
      return;
    }
    fetchAll();
  };

  return (
    <div className="admin-films-page">
      <div className="admin-films-header">
        <h1>비정형 도형 관리</h1>
        <button className="admin-btn admin-btn-primary" onClick={openAddModal}>
          + 새 비정형 도형 추가
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
                <th>기준 크기</th>
                <th>카테고리</th>
                <th>활성</th>
                <th>정렬</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="status-text">등록된 비정형 도형이 없습니다.</td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className={row.is_active ? '' : 'inactive'}>
                  <td>
                    {row.preview_image_url ? (
                      <img src={row.preview_image_url} alt={row.name} className="preview-thumb" />
                    ) : (
                      <PathThumb pathData={row.path_data} width={row.base_width} height={row.base_height} />
                    )}
                  </td>
                  <td>{row.name}</td>
                  <td>
                    {Math.round(Number(row.base_width))} × {Math.round(Number(row.base_height))} mm
                  </td>
                  <td>{row.category || '-'}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!row.is_active}
                      onChange={() => toggleActive(row)}
                    />
                  </td>
                  <td>{row.display_order}</td>
                  <td>
                    <div className="row-actions">
                      <button className="admin-btn" onClick={() => openEditModal(row)}>
                        수정
                      </button>
                      <button className="admin-btn admin-btn-danger" onClick={() => deleteRow(row)}>
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
        <CustomShapeFormModal
          row={editingRow}
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

// 작은 SVG path 미리보기 — 별도 이미지 업로드가 없을 때 fallback. 도형은
// (0, 0) 중심으로 정규화되어 있으므로 viewBox를 baseWidth/Height로 잡고
// 중심 정렬한다.
function PathThumb({ pathData, width, height }) {
  if (!pathData || !width || !height) {
    return <div className="preview-thumb" />;
  }
  const w = Number(width);
  const h = Number(height);
  const pad = Math.max(w, h) * 0.08;
  const vbW = w + pad * 2;
  const vbH = h + pad * 2;
  return (
    <svg
      className="preview-thumb"
      viewBox={`${-vbW / 2} ${-vbH / 2} ${vbW} ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={pathData}
        fill="none"
        stroke="#334155"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// 등록 / 수정 모달.
//
// 신규 등록 시: DXF 파일 업로드는 필수. 사용자가 파일을 고르면 즉시
// importDXFtoShapes()를 호출해서 path_data + bounds를 얻어 폼 상태에
// 보관한다(아직 DB에는 저장하지 않음). 저장 버튼 클릭 시:
//   1) row insert (preview_image_url 없이) → id 받음
//   2) preview 이미지가 첨부됐다면 {id}/{timestamp}-{name} 경로로 업로드
//   3) row update {preview_image_url}
//
// 수정 시: path_data는 그대로 두고 메타데이터/preview만 갱신할 수 있다.
// DXF를 새로 올리면 path_data + base_width/height까지 갱신된다.
function CustomShapeFormModal({ row, onClose, onSaved }) {
  const isEdit = !!row;
  const [form, setForm] = useState(() => {
    if (!row) return { ...emptyForm };
    return {
      name: row.name || '',
      category: row.category || '',
      is_active: !!row.is_active,
      display_order: row.display_order ?? 0,
    };
  });

  // 파싱된 DXF 결과 — 등록 시 필수, 수정 시 선택. 신규 DXF를 고르면
  // pathData/baseWidth/baseHeight가 덮어쓰여진다.
  const [parsed, setParsed] = useState(() => {
    if (!row) return null;
    return {
      pathData: row.path_data,
      baseWidth: Number(row.base_width),
      baseHeight: Number(row.base_height),
    };
  });
  const [dxfError, setDxfError] = useState('');

  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const localFileUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile]
  );
  useEffect(() => {
    return () => { if (localFileUrl) URL.revokeObjectURL(localFileUrl); };
  }, [localFileUrl]);

  const previewUrl = localFileUrl || (isEdit ? row?.preview_image_url : null);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleDxfFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setDxfError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const dxfContent = ev.target.result;
        const result = importDXFtoShapes(dxfContent);
        if (!result || !result.data) {
          setDxfError('DXF 파일을 해석할 수 없습니다. 빈 도면이거나 지원하지 않는 형식입니다.');
          return;
        }
        setParsed({
          pathData: result.data,
          baseWidth: result.width,
          baseHeight: result.height,
        });
      } catch (err) {
        console.error(err);
        setDxfError('DXF 파싱 중 오류: ' + (err.message || '알 수 없는 오류'));
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg('');

    if (!form.name.trim()) {
      setErrMsg('이름을 입력하세요.');
      return;
    }
    if (!parsed || !parsed.pathData) {
      setErrMsg('DXF 파일을 업로드하세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        path_data: parsed.pathData,
        base_width: parsed.baseWidth,
        base_height: parsed.baseHeight,
        category: form.category.trim() || null,
        is_active: form.is_active,
        display_order: parseInt(form.display_order, 10) || 0,
      };

      let rowId = row?.id;
      let previewUrl = row?.preview_image_url || null;
      const oldPreviewUrl = row?.preview_image_url || null;

      if (isEdit) {
        const { error: upErr } = await supabase.from('custom_shapes').update(payload).eq('id', rowId);
        if (upErr) throw upErr;
      } else {
        const { data, error: insErr } = await supabase
          .from('custom_shapes')
          .insert(payload)
          .select()
          .single();
        if (insErr) throw insErr;
        rowId = data.id;
      }

      // Preview image upload — insert-then-upload 전략(AdminFilmsPage와 동일).
      if (imageFile) {
        const safeName = imageFile.name.replace(/[^\w.\-]+/g, '_');
        const path = `${rowId}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, imageFile, { upsert: false, contentType: imageFile.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        previewUrl = pub.publicUrl;

        const { error: urlErr } = await supabase
          .from('custom_shapes')
          .update({ preview_image_url: previewUrl })
          .eq('id', rowId);
        if (urlErr) throw urlErr;

        // Replace old image if any
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
        <h2>{isEdit ? '비정형 도형 수정' : '새 비정형 도형 추가'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label>이름 *</label>
            <CompositionSafeInput
              type="text"
              value={form.name}
              onChange={(v) => setField('name', v)}
              required
            />
          </div>

          <div className="form-row">
            <label>
              DXF 도면 파일 {isEdit ? '(새로 올리면 외곽선이 교체됩니다)' : '*'}
            </label>
            <input
              type="file"
              accept=".dxf"
              onChange={handleDxfFile}
            />
            {dxfError && <div className="form-error">{dxfError}</div>}
            {parsed && parsed.pathData && (
              <div className="custom-shape-preview-box">
                <PathThumb
                  pathData={parsed.pathData}
                  width={parsed.baseWidth}
                  height={parsed.baseHeight}
                />
                <div className="custom-shape-preview-meta">
                  기준 크기:&nbsp;
                  <strong>
                    {Math.round(parsed.baseWidth)} × {Math.round(parsed.baseHeight)} mm
                  </strong>
                </div>
              </div>
            )}
          </div>

          <div className="form-row">
            <label>미리보기 이미지 (선택 — 사이드바 아이콘으로 사용)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
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
            <label>카테고리</label>
            <CompositionSafeInput
              type="text"
              value={form.category}
              onChange={(v) => setField('category', v)}
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
              id="custom_is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setField('is_active', e.target.checked)}
            />
            <label htmlFor="custom_is_active">활성 여부</label>
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

export default AdminCustomShapesPage;
