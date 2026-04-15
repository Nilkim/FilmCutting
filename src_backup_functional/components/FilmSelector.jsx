import React from 'react';
import './FilmSelector.css';

const FilmSelector = ({ films, selectedFilm, onSelect }) => {
    return (
        <div className="film-selector-panel">
            <div className="film-selector-header">
                <h2>필름 선택</h2>
                <p>작업할 필름의 색상/패턴을 먼저 선택해주세요.</p>
            </div>
            <div className="film-options">
                {films.map(film => {
                    const isSelected = selectedFilm && selectedFilm.id === film.id;
                    return (
                        <button
                            key={film.id}
                            className={`film-option ${isSelected ? 'selected' : ''}`}
                            onClick={() => onSelect(film)}
                        >
                            <div
                                className="film-color-preview"
                                style={{ backgroundColor: film.color }}
                            />
                            <div className="film-info">
                                <span className="film-name">{film.name}</span>
                                <span className="film-price">{film.pricePer500.toLocaleString()}원 / 0.5m</span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default FilmSelector;
