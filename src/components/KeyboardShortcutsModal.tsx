import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Keyboard } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  group: string;
  items: ShortcutItem[];
}

export const KeyboardShortcutsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const shortcutGroups: ShortcutGroup[] = [
    {
      group: 'Quick Navigation & Global',
      items: [
        { keys: ['⌘', 'K'], description: 'Open Quick Command & Search Bar' },
        { keys: ['/'], description: 'Quick Focus / Search (when not typing)' },
        { keys: ['?'], description: 'Open Keyboard Shortcuts Guide' },
        { keys: ['Esc'], description: 'Close any active modal or search' },
      ],
    },
    {
      group: 'View Switching',
      items: [
        { keys: ['⌘', '1'], description: 'Switch to Executive Dashboard' },
        { keys: ['⌘', '2'], description: 'Switch to Strategic Calendar' },
        { keys: ['⌘', '3'], description: 'Switch to Project & Event Planner' },
        { keys: ['⌘', '4'], description: 'Switch to Wealth Forecast & Projections' },
        { keys: ['⌘', '5'], description: 'Switch to Funding Finder' },
      ],
    },
    {
      group: 'Workflow & Productivity Actions',
      items: [
        { keys: ['N'], description: 'Open New Transaction modal' },
        { keys: ['P'], description: 'Toggle Financial Privacy Mode (mask balances)' },
        { keys: ['S'], description: 'Force Immediate Cloud Sync' },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-4 bg-stone-900/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.16 }}
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200/90 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-stone-900 text-white flex items-center justify-center shadow-xs">
                  <Keyboard size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 tracking-tight">Keyboard Shortcuts</h3>
                  <p className="text-[11px] text-stone-500 font-medium">Power workflows for lightning-fast productivity</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 flex items-center justify-center transition"
                aria-label="Close shortcuts"
              >
                <X size={18} />
              </button>
            </div>

            {/* List */}
            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {shortcutGroups.map((group) => (
                <div key={group.group} className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                    {group.group}
                  </h4>
                  <div className="divide-y divide-stone-100 rounded-xl border border-stone-100 bg-stone-50/40 overflow-hidden">
                    {group.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3.5 py-2.5 hover:bg-stone-50 transition-colors"
                      >
                        <span className="text-xs text-stone-700 font-medium">{item.description}</span>
                        <div className="flex items-center gap-1 shrink-0 ml-3">
                          {item.keys.map((k, kIdx) => (
                            <kbd
                              key={kIdx}
                              className="px-2 py-0.5 text-[11px] font-bold text-stone-700 bg-white border border-stone-200 rounded shadow-2xs font-mono"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/50 flex items-center justify-between text-[11px] text-stone-500">
              <span className="flex items-center gap-1">
                <Command size={12} className="text-stone-400" />
                Press <kbd className="px-1 py-0.5 bg-white border border-stone-200 rounded text-[10px] font-bold">Esc</kbd> anytime to dismiss
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-stone-900 text-white rounded-lg text-xs font-bold hover:bg-stone-800 transition"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
