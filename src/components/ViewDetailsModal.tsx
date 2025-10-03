import React from 'react';
import { X } from 'lucide-react';
import type { ContributionWithUser } from '../types';

type ViewDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contribution: ContributionWithUser;
};

export function ViewDetailsModal({ isOpen, onClose, contribution }: ViewDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-full max-w-2xl mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Contribution Details</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-400">Personal Information</h3>
                <div className="mt-2 space-y-2">
                  <p className="text-white">
                    {contribution.first_name} {contribution.last_name}
                  </p>
                  <p className="text-gray-300">{contribution.email}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-400">Address</h3>
                <div className="mt-2 space-y-2">
                  <p className="text-white">{contribution.address}</p>
                  <p className="text-gray-300">
                    {contribution.postal_code} {contribution.city}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-400">Contribution</h3>
                <div className="mt-2 space-y-2">
                  <p className="text-2xl font-bold text-white">
                    CHF {contribution.amount.toFixed(2)}
                  </p>
                  <p className={`text-sm ${contribution.paid ? 'text-green-400' : 'text-yellow-400'}`}>
                    {contribution.paid ? 'Paid' : 'Pending'}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-400">Collection Info</h3>
                <div className="mt-2 space-y-2">
                  <p className="text-white">
                    Collected by: {contribution.gennervogt?.email || 'Unknown'}
                  </p>
                  <p className="text-gray-300">
                    Date: {new Date(contribution.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
