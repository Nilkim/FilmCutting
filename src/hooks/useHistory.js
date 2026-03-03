import { useState, useCallback } from 'react';

/**
 * A simple custom hook for Undo/Redo functionality with a limited history size.
 *
 * @param {any} initialPresent - The initial state
 * @param {number} maxHistory - Maximum number of history steps to keep (default 5)
 */
export function useHistory(initialPresent, maxHistory = 5) {
    const [state, setState] = useState({
        past: [],
        present: initialPresent,
        future: []
    });

    const canUndo = state.past.length > 0;
    const canRedo = state.future.length > 0;

    /**
     * Push a new state into the history.
     * Use this whenever the user performs an action.
     */
    const setPresent = useCallback((newPresent) => {
        setState((currentState) => {
            const { past, present } = currentState;

            // If the new state is identical to the current present, do nothing
            // (Assuming shallow compare or JSON stringify compare depending on needs)
            if (JSON.stringify(present) === JSON.stringify(newPresent)) {
                return currentState;
            }

            // Keep maxHistory items in the past
            const newPast = [...past, present].slice(-maxHistory);

            return {
                past: newPast,
                present: newPresent,
                future: [] // Any new action invalidates the future (redo) stack
            };
        });
    }, [maxHistory]);

    /**
     * Undo the last action
     */
    const undo = useCallback(() => {
        setState((currentState) => {
            const { past, present, future } = currentState;

            if (past.length === 0) return currentState;

            const previous = past[past.length - 1];
            const newPast = past.slice(0, past.length - 1);

            return {
                past: newPast,
                present: previous,
                future: [present, ...future]
            };
        });
    }, []);

    /**
     * Redo the next action
     */
    const redo = useCallback(() => {
        setState((currentState) => {
            const { past, present, future } = currentState;

            if (future.length === 0) return currentState;

            const next = future[0];
            const newFuture = future.slice(1);

            return {
                past: [...past, present],
                present: next,
                future: newFuture
            };
        });
    }, []);

    return {
        state: state.present,
        set: setPresent,
        undo,
        redo,
        canUndo,
        canRedo
    };
}
