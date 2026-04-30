import { useEffect, useRef, useState } from 'react';

// OrderPage 작성 중 다른 페이지(예: 주문 조회)로 잠시 이동했다가 돌아왔을 때
// 그리던 도형/필름/전화번호가 사라지지 않도록 sessionStorage에 draft 자동 저장.
//
// 왜 sessionStorage인가:
//   - localStorage는 영구 보관이라 며칠 전 작업 잔재가 남아 혼란스럽다.
//   - sessionStorage는 탭 세션 동안만 살아있어서 "잠깐 다른 페이지 다녀오기"
//     시나리오에 정확히 맞고, 탭을 닫으면 자동 정리되어 프라이버시도 안전.
//
// 왜 selectedFilmId만 저장하는가:
//   - selectedFilm 객체 전체를 직렬화하면 DB의 가격/색상이 바뀌어도 stale
//     스냅샷을 그대로 쓰게 된다. id만 저장하고 복원 시 useFilms 결과에서
//     다시 lookup하면 항상 최신 데이터 반영.

const DRAFT_KEY = 'film-cutting:order-draft';

function readSession() {
    try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeSession(value) {
    try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    } catch {
        // quota 초과/스토리지 비활성 — silently 무시 (작업 자체는 계속 가능)
    }
}

export function clearOrderDraft() {
    try {
        sessionStorage.removeItem(DRAFT_KEY);
    } catch {
        /* ignore */
    }
}

// OrderPage 안에서 호출. 마운트 시 draft 복원 + 변경 시 자동 저장.
//
// useReorderLoader와의 역할 분담:
//   - location.state.reorderFrom이 있으면 → useReorderLoader가 처리, 이 훅은
//     draft 복원을 skip하고 restored=true만 마킹해 이후 자동저장을 활성화.
//   - 없으면 → sessionStorage에서 draft를 읽어 setter들로 복원.
//
// restored 플래그가 필요한 이유:
//   초기 렌더에는 shapes=[], film=null, phone=''인데, 이걸 그대로 자동저장하면
//   sessionStorage의 진짜 draft를 빈 값으로 덮어버린다. restored가 true가
//   되어야(= 복원 시도가 끝나야) 자동저장이 시작되도록 게이트.
export function useOrderDraft({
    films,
    locationState,
    shapes,
    selectedFilm,
    customerPhone,
    setShapes,
    setSelectedFilm,
    setCustomerPhone,
    setIsModalOpen,
}) {
    const restoredRef = useRef(false);
    const [restored, setRestored] = useState(false);

    // 복원: films가 준비된 첫 시점에 단 한 번만 실행.
    useEffect(() => {
        if (restoredRef.current) return;
        if (!films || films.length === 0) return;
        restoredRef.current = true;

        if (locationState?.reorderFrom) {
            // 재주문 흐름은 useReorderLoader가 책임. draft는 무시하고
            // 자동저장만 켠다 — 재주문 데이터로 시작한 편집도 draft로 보관됨.
            setRestored(true);
            return;
        }

        const draft = readSession();
        if (draft) {
            if (Array.isArray(draft.shapes) && draft.shapes.length > 0) {
                setShapes(draft.shapes);
            }
            if (draft.selectedFilmId) {
                const film = films.find((f) => f.id === draft.selectedFilmId);
                if (film) {
                    setSelectedFilm(film);
                    // 필름 선택이 복원됐으면 필름 선택 모달은 닫아둔다.
                    setIsModalOpen(false);
                }
            }
            if (draft.customerPhone) {
                setCustomerPhone(draft.customerPhone);
            }
        }
        setRestored(true);
    }, [films, locationState, setShapes, setSelectedFilm, setCustomerPhone, setIsModalOpen]);

    // 자동 저장: 복원 결정이 끝난 뒤부터 작동.
    useEffect(() => {
        if (!restored) return;
        const isEmpty =
            (!shapes || shapes.length === 0) && !selectedFilm && !customerPhone;
        if (isEmpty) {
            // 모두 비어있으면 draft를 굳이 보관할 이유 없음 — 정리.
            clearOrderDraft();
            return;
        }
        writeSession({
            shapes: shapes || [],
            selectedFilmId: selectedFilm?.id || null,
            customerPhone: customerPhone || '',
            savedAt: Date.now(),
        });
    }, [restored, shapes, selectedFilm, customerPhone]);
}
