import React, { useState } from 'react';
import { Download, FileSpreadsheet, File as FilePdf, X } from 'lucide-react';
import type { ContributionWithUser } from '../types';
import { utils, writeFile } from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

type ExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  contributions: ContributionWithUser[];
};

export function ExportModal({ isOpen, onClose, contributions }: ExportModalProps) {
  const [exporting, setExporting] = useState(false);

  if (!isOpen) return null;

  const handleExportExcel = async () => {
    try {
      setExporting(true);

      const data = contributions.map(c => ({
        'First Name': c.first_name,
        'Last Name': c.last_name,
        'Email': c.email,
        'Address': c.address,
        'City': c.city,
        'Postal Code': c.postal_code,
        'Amount (CHF)': c.amount.toFixed(2),
        'Status': c.paid ? 'Paid' : 'Pending',
        'Collected By': c.gennervogt?.email || 'Unknown',
        'Date': new Date(c.created_at).toLocaleDateString(),
      }));

      const wb = utils.book_new();
      const ws = utils.json_to_sheet(data);
      utils.book_append_sheet(wb, ws, 'Contributions');

      writeFile(wb, `contributions-${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
    } finally {
      setExporting(false);
      onClose();
    }
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);

      const doc = new jsPDF();

      // Add title
      doc.setFontSize(20);
      doc.text('Contributions Report', 14, 20);
      doc.setFontSize(12);
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30);

      // Add summary
      const totalAmount = contributions.reduce((sum, c) => sum + c.amount, 0);
      const paidAmount = contributions.filter(c => c.paid).reduce((sum, c) => sum + c.amount, 0);
      
      doc.text([
        `Total Contributions: ${contributions.length}`,
        `Total Amount: CHF ${totalAmount.toFixed(2)}`,
        `Paid Amount: CHF ${paidAmount.toFixed(2)}`,
        `Unpaid Amount: CHF ${(totalAmount - paidAmount).toFixed(2)}`,
      ], 14, 40);

      // Add table
      (doc as any).autoTable({
        startY: 60,
        head: [['Name', 'Email', 'Address', 'Amount (CHF)', 'Status', 'Collected By', 'Date']],
        body: contributions.map(c => [
          `${c.first_name} ${c.last_name}`,
          c.email,
          `${c.address}, ${c.city} ${c.postal_code}`,
          c.amount.toFixed(2),
          c.paid ? 'Paid' : 'Pending',
          c.gennervogt?.email || 'Unknown',
          new Date(c.created_at).toLocaleDateString(),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [220, 38, 38] },
      });

      doc.save(`contributions-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
    } finally {
      setExporting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg w-full max-w-md mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center">
              <Download className="w-6 h-6 text-red-500 mr-2" />
              <h2 className="text-2xl font-bold text-white">Export Data</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-5 h-5 mr-2" />
              Export to Excel
            </button>

            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="w-full flex items-center justify-center px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <FilePdf className="w-5 h-5 mr-2" />
              Export to PDF
            </button>
          </div>

          {exporting && (
            <div className="mt-4 text-center text-gray-400">
              Preparing export...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
