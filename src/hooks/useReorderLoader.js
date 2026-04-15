import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Call inside OrderPage with setters. On first mount, if navigation state carries
// reorderFrom, load it into editor state and clear the navigation state.
export function useReorderLoader({ films, setSelectedFilm, setShapes, setIsModalOpen }) {
  const { state } = useLocation();
  const navigate = useNavigate();
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    if (!state?.reorderFrom) return;
    if (!films || films.length === 0) return;
    const { shapes_json, film_id } = state.reorderFrom;
    const film = films.find((f) => f.id === film_id);
    if (film) {
      setSelectedFilm(film);
      setIsModalOpen(false);
    }
    if (Array.isArray(shapes_json)) {
      setShapes(shapes_json);
    }
    loaded.current = true;
    navigate('.', { replace: true, state: null });
  }, [state, films, setSelectedFilm, setShapes, setIsModalOpen, navigate]);
}
