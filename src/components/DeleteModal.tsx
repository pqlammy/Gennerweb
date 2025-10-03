import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

type DeleteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  itemCount: number;
};

export function DeleteModal({ isOpen, onClose, onConfirm, loading, itemCount }: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-2" />
              <h2 className="text-2xl font-bold text-white">Confirm Deletion</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-gray-300">
              Are you sure you want to delete {itemCount} {itemCount === 1 ? 'contribution' : 'contributions'}? This action cannot be undone.
            </p>

            <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
              <p className="text-sm text-red-400">
                Warning: This will permanently remove all selected contributions and their associated data.
              </p>
            </div>

            <div className="flex space-x-4 pt-4">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
