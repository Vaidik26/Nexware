import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { PageLoader } from '@/components/ui/PageLoader';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ArrowLeft, FileSpreadsheet, Download, CheckCircle2, Box, Package, ScanLine, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { downloadPicklistPDF, downloadPicklistExcel } from '@/lib/downloadPicklist';
import { toast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import jsQR from 'jsqr';

export default function PickListDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [picklist, setPicklist] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'audit' | 'sequence'>('sequence');
  const [expandedBoxes, setExpandedBoxes] = useState<Set<number>>(new Set());
  
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  // QR Verification Modal State
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

  const [verifiedBoxes, setVerifiedBoxes] = useState<Set<number>>(new Set());
  const [isVerifying, setIsVerifying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPicklist();
  }, [id]);

  const fetchPicklist = async () => {
    try {
      const res = await api.get(`/picklists/${id}`);
      setPicklist(res.data);
      const auditedIds = res.data.boxes.filter((b: any) => b.is_audited).map((b: any) => b.id);
      setVerifiedBoxes(new Set(auditedIds));
    } catch (err) {
      toast.error('Failed to load picklist details');
      navigate('/warehouse/picklists');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePdfDownload = async () => {
    if (!picklist) return;
    setIsDownloadingPdf(true);
    await downloadPicklistPDF(picklist);
    setIsDownloadingPdf(false);
  };

  const handleExcelDownload = async () => {
    if (!picklist) return;
    setIsDownloadingExcel(true);
    await downloadPicklistExcel(picklist);
    setIsDownloadingExcel(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVerifying(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          toast.error('Failed to process image');
          setIsVerifying(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });

        setIsVerifying(false);

        if (code) {
          try {
            const data = JSON.parse(code.data);
            if (data.box_id) {
              const boxId = parseInt(data.box_id.replace('BOX-', ''));
              const boxExists = picklist.boxes.find((b: any) => b.id === boxId);
              
              if (!boxExists) {
                toast.error(`QR Code belongs to Box ${boxId}, which is not part of this picklist.`);
                return;
              }

              if (verifiedBoxes.has(boxId)) {
                toast.error(`Box ${boxId} has already been scanned and verified.`);
                return;
              }

              // Call API to persist verification
              api.post(`/picklists/${id}/boxes/${boxId}/verify`)
                .then(() => {
                  toast.success(`Successfully verified Box ${boxId}!`);
                  setVerifiedBoxes(prev => new Set(prev).add(boxId));
                  setIsVerifyModalOpen(false);
                })
                .catch((err) => {
                  toast.error(err.response?.data?.detail || 'Failed to verify box on server');
                });
            } else {
              toast.error(`Invalid QR code format. Missing box_id.`);
            }
          } catch (err) {
            toast.error('Invalid QR Code format.');
          }
        } else {
          toast.error('No QR Code found in the image. Please try again.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (isLoading) return <PageLoader message="Loading details..." />;
  if (!picklist) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/warehouse/picklists')}
            className="p-2 hover:bg-surface-variant rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-on-surface-variant" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-on-surface">Order {picklist.order_number}</h1>
              <StatusBadge status={picklist.status} />
            </div>
            <p className="text-on-surface-variant text-sm mt-1">
              Customer: <span className="font-medium text-on-surface">{picklist.customer_name}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handlePdfDownload} disabled={isDownloadingPdf} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> {isDownloadingPdf ? 'Generating...' : 'Export PDF'}
          </Button>
          <Button variant="outline" onClick={handleExcelDownload} disabled={isDownloadingExcel} className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> {isDownloadingExcel ? 'Generating...' : 'Export Excel'}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-outline-variant">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('sequence')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'sequence'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Picking Sequence
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface hover:border-outline-variant'
            }`}
          >
            <Package className="w-4 h-4" />
            Audit & Verify
          </button>
        </nav>
      </div>

      {/* Tab Contents */}
      <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden min-h-[500px]">
        {activeTab === 'audit' ? (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-on-surface">Sealed Boxes Pending Audit</h3>
              {picklist.boxes.length > 0 && (
                <Button 
                  onClick={() => setIsVerifyModalOpen(true)} 
                  className="bg-[#003527] hover:bg-[#006c49] text-white flex items-center gap-2"
                >
                  <ScanLine className="w-4 h-4" /> Verify Box Label
                </Button>
              )}
            </div>
            
            {picklist.boxes.length === 0 ? (
              <div className="text-center py-12">
                <Box className="w-12 h-12 text-outline mx-auto mb-3" />
                <p className="text-on-surface-variant font-medium">No loose item boxes have been sealed yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {picklist.boxes.map((box: any, index: number) => {
                  const isVerified = verifiedBoxes.has(box.id);
                  const isExpanded = expandedBoxes.has(box.id);
                  
                  const toggleExpanded = () => {
                    const newExpanded = new Set(expandedBoxes);
                    if (isExpanded) {
                      newExpanded.delete(box.id);
                    } else {
                      newExpanded.add(box.id);
                    }
                    setExpandedBoxes(newExpanded);
                  };

                  return (
                    <div key={box.id} className={`border rounded-xl p-5 ${isVerified ? 'bg-emerald-50/50 border-emerald-200' : 'bg-surface border-outline-variant'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 cursor-pointer" onClick={toggleExpanded}>
                            <h4 className="font-bold text-lg text-on-surface flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="w-5 h-5 text-on-surface-variant" /> : <ChevronRight className="w-5 h-5 text-on-surface-variant" />}
                              Box {index + 1} - {box.carton_type?.name || 'Standard Carton'}
                            </h4>
                            {isVerified && (
                              <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Scanned
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-on-surface-variant font-medium mb-3 ml-7">Recorded Weight: {box.entered_weight} kg</p>
                          
                          {isExpanded && (
                            <div className="space-y-2 mt-4 border-t border-outline-variant pt-4 ml-7">
                              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Contents ({box.box_items?.length || 0} items)</p>
                              {box.box_items?.map((bi: any) => {
                                const itemDetails = picklist.items.find((i: any) => i.id === bi.item_id);
                                return (
                                  <div key={bi.id} className="flex items-center justify-between text-sm w-full max-w-lg py-1">
                                    <span className="text-on-surface truncate pr-4 flex-1">{itemDetails?.product_name || `Item #${bi.item_id}`}</span>
                                    <span className="text-on-surface-variant font-medium whitespace-nowrap text-right">{bi.quantity} {itemDetails?.unit || 'units'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-0">
             <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-surface-variant/50 border-b border-outline-variant">
                <tr>
                  <th className="p-4 font-semibold text-on-surface-variant w-16 text-center">Status</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Bin Location</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Barcode</th>
                  <th className="p-4 font-semibold text-on-surface-variant">Product Name</th>
                  <th className="p-4 font-semibold text-on-surface-variant text-right">Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {[...picklist.items].sort((a, b) => (a.bin_location || '').localeCompare(b.bin_location || '')).map((item: any) => (
                  <tr key={item.id} className="hover:bg-surface-variant/30 transition-colors">
                    <td className="p-4 text-center">
                      {item.is_picked ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border-2 border-outline mx-auto" />
                      )}
                    </td>
                    <td className="p-4">
                      <span className="bg-secondary/10 text-secondary-dark px-2.5 py-1 rounded-lg text-xs font-semibold">
                        {item.bin_location || 'No Bin'}
                      </span>
                    </td>
                    <td className="p-4 text-on-surface-variant font-mono">{item.barcode}</td>
                    <td className="p-4 font-medium text-on-surface whitespace-normal">{item.product_name}</td>
                    <td className="p-4 text-right font-semibold text-on-surface">
                      {item.is_picked ? item.picked_quantity : 0} / {item.quantity} {item.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Verification Modal (QR Upload) */}
      <Modal
        isOpen={isVerifyModalOpen}
        onClose={() => {
          if (!isVerifying) setIsVerifyModalOpen(false);
        }}
        title={`Verify Box Label`}
      >
        <div className="space-y-6 py-4">
          <p className="text-on-surface-variant text-sm">
            Upload the QR code image saved from the Picker App to simulate scanning the physical label.
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700">
              In production, you would scan the label with a barcode scanner. For this prototype, upload the QR PNG you saved on the device.
            </p>
          </div>

          <div className="border-2 border-dashed border-outline-variant rounded-xl p-10 flex flex-col items-center justify-center bg-surface-variant/20">
            {isVerifying ? (
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-on-surface font-medium">Analyzing QR Code...</p>
              </div>
            ) : (
              <>
                <ScanLine className="w-12 h-12 text-primary mb-4" />
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  variant="primary"
                >
                  Upload QR Image
                </Button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageUpload}
                />
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
