'use client';

import * as React from 'react';

export type ToastType = 'default' | 'destructive' | 'success';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: ToastType;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface UseToastOptions {
  duration?: number;
}

interface UseToastReturn {
  toast: (options: Omit<Toast, 'id'> & UseToastOptions) => void;
  toasts: Toast[];
  dismiss: (id: string) => void;
}

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 5000;

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ToastState = {
  toasts: Toast[];
};

type ToastAction =
  | { type: 'ADD_TOAST'; toast: Toast }
  | { type: 'UPDATE_TOAST'; toast: Partial<Toast> & { id: string } }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'REMOVE_TOAST'; id: string };

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(id: string) {
  if (toastTimeouts.has(id)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(id);
    dispatch({ type: 'REMOVE_TOAST', id });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(id, timeout);
}

export const reducer = (state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case 'DISMISS_TOAST': {
      const { id } = action;

      if (id) {
        addToRemoveQueue(id);
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === id || id === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case 'REMOVE_TOAST':
      return action.id === undefined
        ? {
            ...state,
            toasts: [],
          }
        : {
            ...state,
            toasts: state.toasts.filter((t) => t.id !== action.id),
          };
  }
};

const listeners: Array<(state: ToastState) => void> = [];

let memoryState: ToastState = { toasts: [] };

function dispatch(action: ToastAction) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type ToastFn = Omit<Toast, 'id'> & UseToastOptions;

function toast({ ...props }: ToastFn) {
  const id = genId();

  const update = (props: ToastFn) =>
    dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...props, id },
    });
  const dismiss = () => dispatch({ type: 'DISMISS_TOAST', id });

  dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return {
    id: id,
    dismiss,
    update,
  };
}

function useToast(): UseToastReturn {
  const [state, setState] = React.useState<ToastState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (id: string) => dispatch({ type: 'DISMISS_TOAST', id }),
  };
}

export { useToast, toast };