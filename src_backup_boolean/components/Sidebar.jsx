import React from 'react';
import { Square, Circle, Triangle, Star, MessageSquare } from 'lucide-react';
import './Sidebar.css';

const TOOLS = [
    { id: 'rect', label: '사각형', icon: <Square size={24} /> },
    { id: 'circle', label: '원형', icon: <Circle size={24} /> },
    { id: 'triangle', label: '삼각형', icon: <Triangle size={24} /> },
    { id: 'star', label: '별표', icon: <Star size={24} /> },
    { id: 'bubble', label: '말풍선', icon: <MessageSquare size={24} /> },
];

const Sidebar = ({ onAddShape }) => {
    return (
        <aside className="sidebar">
            <div className="sidebar-title">
                도형 추가
            </div>
            <div className="tools-grid">
                {TOOLS.map(tool => (
                    <button
                        key={tool.id}
                        className="tool-btn"
                        onClick={() => onAddShape(tool.id)}
                    >
                        <div className="tool-icon">{tool.icon}</div>
                        <span className="tool-label">{tool.label}</span>
                    </button>
                ))}
            </div>
        </aside>
    );
};

export default Sidebar;
