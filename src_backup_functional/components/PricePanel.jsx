import React from 'react';
import './PricePanel.css';

const PricePanel = ({ selectedFilm, maxLength }) => {
    // Logic to round up to nearest 500mm
    const billableLength = Math.ceil(Math.max(maxLength, 0) / 500) * 500;
    const unitCount = billableLength / 500;
    const totalPrice = unitCount * selectedFilm.pricePer500;

    return (
        <div className="price-panel">
            <h3 className="panel-title">주문 요약 (Order Summary)</h3>

            <div className="summary-section">
                <div className="summary-row">
                    <span className="summary-label">선택된 필름</span>
                    <span className="summary-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                            style={{
                                width: '16px', height: '16px',
                                backgroundColor: selectedFilm.color,
                                borderRadius: '4px', border: '1px solid #e2e8f0'
                            }}
                        />
                        {selectedFilm.name}
                    </span>
                </div>
                <div className="summary-row">
                    <span className="summary-label">필름 폭 (Width)</span>
                    <span className="summary-value">1220mm</span>
                </div>
                <div className="summary-row">
                    <span className="summary-label">총 소요 길이</span>
                    <span className="summary-value highlight">
                        {(billableLength / 1000).toFixed(1)}m <small>({billableLength}mm)</small>
                    </span>
                </div>
                <div className="summary-row">
                    <span className="summary-label">0.5m당 단가</span>
                    <span className="summary-value">{selectedFilm.pricePer500.toLocaleString()}원</span>
                </div>
            </div>

            <div className="total-section">
                <div className="total-label">예상 총 금액</div>
                <div className="total-price">{totalPrice.toLocaleString()}<span>원</span></div>
            </div>

            <button className="order-btn">
                주문하기 (Proceed to Order)
            </button>
        </div>
    );
};

export default PricePanel;
