# Reorder loader integration (1 line in OrderPage.jsx)
Add near the top of OrderPage component, after the useFilms() call and after the state hooks (setSelectedFilm, setShapes, setIsModalOpen exist):

  useReorderLoader({ films, setSelectedFilm, setShapes, setIsModalOpen });

Import at top:
  import { useReorderLoader } from '../hooks/useReorderLoader';
