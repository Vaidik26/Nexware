import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, ActivityIndicator, TextInput, Alert, Share, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, CheckCircle2, Box, Scan, AlertCircle, Package, Plus, ChevronRight } from 'lucide-react-native';
import PickItemRow from '../../../components/PickItemRow';
import { playTickSound } from '../../../lib/alertSound';
import api from '../../../lib/api';
import { markJobSubmitted } from '../../../lib/jobSignals';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickItem {
  id: string;
  barcode: string;
  name: string;
  qty: number;
  uom: string;
  picked: boolean;
  picked_qty: number;
  missing_reported: boolean;
  bin_location: string | null;
  is_full_carton: boolean;
}

interface CartonType {
  id: number;
  name: string;
  tare_weight: number;
}

interface BoxContent {
  item_id: number;
  quantity: number;
  item_name: string; // local only, for display
}

interface ActiveBox {
  carton_type_id: number;
  carton_name: string;
  contents: BoxContent[]; // items scanned into this box so far
}

// Carton types are shared across every job and effectively static, so they live
// outside the component and survive navigation between jobs.
const CARTON_CACHE_TTL_MS = 10 * 60 * 1000;
let _cartonCache: { value: CartonType[] | null; at: number } = { value: null, at: 0 };

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── Data state ──
  const [items, setItems] = useState<PickItem[]>([]);
  const [picklistInfo, setPicklistInfo] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [cartonTypes, setCartonTypes] = useState<CartonType[]>([]);
  const [blockingJob, setBlockingJob] = useState<string | null>(null);

  // ── Submission state ──
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Scan modal state ──
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanMode, setScanMode] = useState<'choice' | 'manual' | 'camera'>('choice');
  const [scanTargetItem, setScanTargetItem] = useState<PickItem | null>(null);
  const [scanInput, setScanInput] = useState('');
  const [cameraScanned, setCameraScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  // ── Quantity modal state ──
  const [qtyModalVisible, setQtyModalVisible] = useState(false);
  const [qtyInput, setQtyInput] = useState('');
  const [qtyTargetItem, setQtyTargetItem] = useState<PickItem | null>(null);

  // ── NEW: Active box state (the box currently being filled) ──
  const [activeBox, setActiveBox] = useState<ActiveBox | null>(null);
  const [showCartonSelectModal, setShowCartonSelectModal] = useState(false);
  const [cartonSelectMode, setCartonSelectMode] = useState<'new' | 'change'>('new'); // 'change' keeps contents
  // Item waiting for box selection. It carries one extra field the API never
  // sees: `box_qty` is the amount just entered, i.e. how much of this item goes
  // into THIS box, as opposed to `picked_qty` which is the running total across
  // every box. The two diverge whenever a line is split across cartons, so the
  // staging value is kept here rather than on PickItem, which mirrors an API row.
  const [pendingLooseItem, setPendingLooseItem] = useState<
    (PickItem & { box_qty?: number }) | null
  >(null);

  // ── Sealed boxes (completed this session, shown as history strip) ──
  interface SealedBoxSummary { id: number; carton_name: string; item_count: number; total_qty: number; weight: number; }
  const [sealedBoxes, setSealedBoxes] = useState<SealedBoxSummary[]>([]);
  const [sealedItemIds, setSealedItemIds] = useState<Set<string>>(new Set());

  // ── Seal box modal state ──
  const [showSealModal, setShowSealModal] = useState(false);
  const [sealWeight, setSealWeight] = useState('');
  const [isSealing, setIsSealing] = useState(false);
  const [weightEstimate, setWeightEstimate] = useState<any>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [showSealedListModal, setShowSealedListModal] = useState(false);

  // ── QR modal state ──
  const [showQRModal, setShowQRModal] = useState(false);
  const [generatedQRData, setGeneratedQRData] = useState<any>(null);

  // ── Print Simulation Ref ──
  const qrViewRef = useRef<View>(null);

  const handleShareQR = async () => {
    try {
      if (!qrViewRef.current) {
        Alert.alert('Error', 'QR label is not ready yet. Please wait a moment and try again.');
        return;
      }
      const uri = await captureRef(qrViewRef, {
        format: 'png',
        quality: 1,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: 'Save or Print Box Label',
        mimeType: 'image/png',
      });
      // Do NOT close the modal here — let the user press "Done — Continue Picking"
      // The modal must stay visible until the user explicitly dismisses it
    } catch (err: any) {
      const msg: string = err?.message || '';
      // Silently ignore if user cancelled the share sheet
      if (msg.includes('cancelled') || msg.includes('canceled') || msg.includes('dismissed')) return;
      console.error('Error sharing QR:', err);
      Alert.alert('Error', 'Failed to generate label image. Please try again.');
    }
  };

  // ─── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // All four requests are fired together. They were sequential — detail, then
    // the queue for the FIFO check, then carton types, then the active box — so
    // the screen took the sum of four round trips before showing anything.
    // Nothing here depends on anything else, so the wait is now just the slowest.
    const fetchPicklistDetails = async () => {
      try {
        setIsLoading(true);
        const [detail, queue] = await Promise.all([
          api.get(`/picklists/${id}`),
          // Aggregated queue: one row per job, no items or boxes downloaded.
          api.get('/picklists/my/summary').catch(() => null),
        ]);
        const res = detail;
        if (res && res.data) {
          setPicklistInfo(res.data);
          const mappedItems = (res.data.items || []).map((item: any): PickItem => ({
            id: String(item.id),
            barcode: item.barcode || 'N/A',
            name: item.product_name || 'Item',
            qty: item.quantity || 1,
            uom: item.unit || 'EA',
            picked: item.is_picked || false,
            picked_qty: item.picked_quantity || 0,
            missing_reported: item.missing_reported || false,
            bin_location: item.bin_location,
            is_full_carton: item.is_full_carton,
          }));
          setItems(mappedItems);

          // Initialize sealed boxes from server
          const loadedBoxes = (res.data.boxes || []).map((b: any) => ({
             id: b.id,
             carton_name: b.carton_name || 'Box',
             carton_type: b.carton_type || 'Unknown'
          }));
          setSealedBoxes(loadedBoxes);

          // Track items that are already sealed in boxes
          const boxedIds = new Set<string>();
          (res.data.boxes || []).forEach((b: any) => {
            (b.box_items || []).forEach((bi: any) => {
              boxedIds.add(String(bi.item_id));
            });
          });
          setSealedItemIds(boxedIds);

          // Check for FIFO blocking, using the aggregated queue fetched above.
          try {
            if (queue && Array.isArray(queue.data)) {
              // Jobs that are 'assigned'/'picking', or 'waiting_verification'
              // that the warehouse manager has not finished auditing.
              const myJobs = queue.data
                .filter((p: any) => {
                   if (p.status === 'assigned' || p.status === 'picking') return true;
                   // pending_audit is computed server-side; it replaces walking
                   // every box and item of every job on the phone.
                   if (p.status === 'waiting_verification') return !!p.pending_audit;
                   return false;
                })
                .sort((a: any, b: any) => Number(a.id) - Number(b.id));

              // Block if there is any older incomplete job
              const olderJob = myJobs.find((p: any) => p.id < Number(id));
              if (olderJob) {
                  setBlockingJob(olderJob.order_number || `P-${olderJob.id}`);
              } else {
                  // Even if it's not older, if there's a job currently actively picking that isn't this one
                  const activeJob = myJobs.find((p: any) => p.status === 'picking');
                  if (activeJob && String(activeJob.id) !== String(id)) {
                      setBlockingJob(activeJob.order_number || `P-${activeJob.id}`);
                  } else {
                      setBlockingJob(null);
                  }
              }
            }
          } catch (e) {
            console.log('Could not fetch queue for FIFO check', e);
          }

        }
      } catch (err) {
        setSubmitError('Could not load picklist from server.');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchCartonTypes = async () => {
      // Carton types are master data that changes maybe once a quarter, but
      // this refetched them on every job open. Serve the cached copy instantly
      // and only hit the network when it is empty or stale.
      if (_cartonCache.value && Date.now() - _cartonCache.at < CARTON_CACHE_TTL_MS) {
        setCartonTypes(_cartonCache.value);
        return;
      }
      try {
        const res = await api.get('/catalogue/cartons');
        const data = res.data || [];
        _cartonCache = { value: data, at: Date.now() };
        setCartonTypes(data);
      } catch (err) {
        if (_cartonCache.value) setCartonTypes(_cartonCache.value);
      }
    };
    
    const fetchActiveBox = async () => {
      try {
        const res = await api.get(`/picklists/${id}/active-box`);
        if (res.data) {
          setActiveBox(res.data);
        }
      } catch (e) {
      } finally {
        setIsDraftLoaded(true);
      }
    };

    // ── Reset all stale state from previous job immediately when id changes ──
    setActiveBox(null);
    setSealedBoxes([]);
    setSealedItemIds(new Set());
    setIsDraftLoaded(false);
    setBlockingJob(null);
    setItems([]);
    setPicklistInfo({});

    fetchPicklistDetails();
    fetchCartonTypes();
    fetchActiveBox();
  }, [id]);

  // ─── Save Active Box to Server ──────────────────────────────────────────

  const [isDraftLoaded, setIsDraftLoaded] = useState(false);

  useEffect(() => {
    if (!isDraftLoaded) return;
    
    const saveActiveBox = async () => {
      try {
        if (activeBox) {
          await api.put(`/picklists/${id}/active-box`, activeBox);
        } else {
          await api.delete(`/picklists/${id}/active-box`);
        }
      } catch (err) {
        console.error('Failed to save active box to server');
      }
    };
    
    saveActiveBox();
  }, [activeBox, isDraftLoaded, id]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const pickedCount = items.filter(i => i.picked).length;
  const isComplete = items.length > 0 && pickedCount === items.length;

  const jobNum = picklistInfo.picker_job_number;
  const jobLabel = jobNum
    ? `P-${String(jobNum).padStart(3, '0')}`
    : id ? `P-${String(id).padStart(3, '0')}` : 'Job';

  const isSubmitted =
    picklistInfo?.status === 'waiting_verification' ||
    picklistInfo?.status === 'verified' ||
    picklistInfo?.status === 'completed';

  // All loose items that have been picked but not yet fully boxed
  const looseItems = items.filter(i => !i.is_full_carton);
  const hasLooseItems = looseItems.length > 0;
  const hasUnboxedLooseItems = looseItems.some(i => i.picked && !i.missing_reported && !sealedItemIds.has(i.id));

  // Active box: how many total units are staged in current box
  const activeBoxTotal = activeBox?.contents.reduce((sum, c) => sum + c.quantity, 0) ?? 0;

  // ─── Quantity submit handler ────────────────────────────────────────────────

  const handleQtySubmit = async () => {
    if (!qtyTargetItem) return;
    const val = parseFloat(qtyInput);
    if (isNaN(val) || val < 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid number');
      return;
    }

    setQtyModalVisible(false);
    const newPickedQty = qtyTargetItem.picked_qty + val;

    // For loose items: if no active box yet, show carton select first
    if (!qtyTargetItem.is_full_carton && !activeBox) {
      setPendingLooseItem({ ...qtyTargetItem, picked_qty: newPickedQty, box_qty: val });
      setShowCartonSelectModal(true);
      return;
    }

    // Optimistic update
    setItems(prev =>
      prev.map(i => i.id === qtyTargetItem.id ? { ...i, picked: true, picked_qty: newPickedQty } : i)
    );

    try {
      await api.patch(`/picklists/${id}/items/${qtyTargetItem.id}/pick`, { picked_quantity: newPickedQty });
    } catch (err) {
      setItems(prev =>
        prev.map(i =>
          i.id === qtyTargetItem.id
            ? { ...i, picked: qtyTargetItem.picked, picked_qty: qtyTargetItem.picked_qty }
            : i
        )
      );
      Alert.alert('Error', 'Failed to update quantity');
      setQtyTargetItem(null);
      return;
    }

    // If loose item and we have an active box, add to box contents
    if (!qtyTargetItem.is_full_carton && activeBox && val > 0) {
      addToActiveBox(qtyTargetItem, val);
    }

    setQtyTargetItem(null);
  };

  // ─── Active box helpers ────────────────────────────────────────────────────

  const addToActiveBox = (item: PickItem, qty: number) => {
    if (!activeBox) return;
    setActiveBox(prev => {
      if (!prev) return null;
      const existing = prev.contents.find(c => c.item_id === parseInt(item.id));
      if (existing) {
        // Accumulate quantity for same item
        return {
          ...prev,
          contents: prev.contents.map(c =>
            c.item_id === parseInt(item.id)
              ? { ...c, quantity: c.quantity + qty }
              : c
          ),
        };
      }
      return {
        ...prev,
        contents: [
          ...prev.contents,
          { item_id: parseInt(item.id), quantity: qty, item_name: item.name },
        ],
      };
    });
  };

  const handleCartonSelect = (carton: CartonType) => {
    setShowCartonSelectModal(false);

    if (cartonSelectMode === 'change') {
      // Keep contents, just swap carton type
      setActiveBox(prev => prev ? { ...prev, carton_type_id: carton.id, carton_name: carton.name } : null);
      return;
    }

    // 'new' mode — create fresh active box
    const newBox: ActiveBox = {
      carton_type_id: carton.id,
      carton_name: carton.name,
      contents: [],
    };
    setActiveBox(newBox);

    // Now process the pending loose item that triggered the carton select
    if (pendingLooseItem) {
      const item = pendingLooseItem;
      const totalPickedQty = item.picked_qty;
      const boxQty = item.box_qty || totalPickedQty;

      // Optimistic UI update for picked status
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, picked: true, picked_qty: totalPickedQty } : i)
      );
      api.patch(`/picklists/${id}/items/${item.id}/pick`, { picked_quantity: totalPickedQty }).catch(() => {
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, picked: false, picked_qty: totalPickedQty - boxQty } : i)
        );
        Alert.alert('Error', 'Failed to update quantity');
      });

      // Add to the newly created box
      if (boxQty > 0) {
        setActiveBox({
          ...newBox,
          contents: [{ item_id: parseInt(item.id), quantity: boxQty, item_name: item.name }],
        });
      }
      setPendingLooseItem(null);
    }
  };

  // ─── Seal box ──────────────────────────────────────────────────────────────

  const fetchEstimate = async () => {
    if (!activeBox) return;
    setIsEstimating(true);
    try {
      const res = await api.post(`/picklists/${id}/boxes/estimate-weight`, {
        carton_type_id: activeBox.carton_type_id,
        entered_weight: 0,
        contents: activeBox.contents.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
      });
      setWeightEstimate(res.data);
    } catch (err) {
      console.error('Failed to get weight estimate', err);
      setWeightEstimate(null);
    } finally {
      setIsEstimating(false);
    }
  };

  const handleOpenSealModal = () => {
    if (!activeBox) return;
    // Opening the modal flips showSealModal, which the effect below is already
    // watching. Calling fetchEstimate() here as well fired the request twice
    // for every seal — doubling the wait on the weight guideline.
    setShowSealModal(true);
  };

  useEffect(() => {
    if (!showSealModal || !activeBox) return;
    // Contents can change while the modal is open (the picker scans another
    // item in), so re-estimate — but coalesce bursts into a single request.
    const timer = setTimeout(fetchEstimate, 150);
    return () => clearTimeout(timer);
  }, [activeBox, showSealModal]);

  const handleSealBox = async () => {
    if (!activeBox || !sealWeight) {
      Alert.alert('Error', 'Please enter the box weight');
      return;
    }

    setIsSealing(true);
    try {
      const res = await api.post(`/picklists/${id}/boxes/seal`, {
        carton_type_id: activeBox.carton_type_id,
        entered_weight: parseFloat(sealWeight),
        contents: activeBox.contents.map(c => ({ item_id: c.item_id, quantity: c.quantity })),
      });

      // Add to sealed history strip
      const totalQty = activeBox.contents.reduce((s, c) => s + c.quantity, 0);
      setSealedBoxes(prev => [...prev, {
        id: res.data.id,
        carton_name: activeBox.carton_name,
        item_count: activeBox.contents.length,
        total_qty: totalQty,
        weight: parseFloat(sealWeight),
      }]);

      // Add sealed items to sealedItemIds state so they no longer trigger "New Box"
      setSealedItemIds(prev => {
        const next = new Set(prev);
        activeBox.contents.forEach(c => next.add(String(c.item_id)));
        return next;
      });

      // Map item IDs to item names
      const itemDetails = activeBox.contents.map(c => {
        const found = items.find(i => String(i.id) === String(c.item_id));
        return { name: found?.name || `Item ${c.item_id}`, qty: c.quantity };
      });

      // Success: generate rich QR payload
      const qrPayload = JSON.stringify({
        box_id: `BOX-${res.data.id}`,
        lpo_no: picklistInfo?.order_number || jobLabel,
        customer: picklistInfo?.customer_name || 'Unknown',
        carton: activeBox.carton_name,
        items_list: itemDetails,
        total_items: activeBox.contents.length,
        total_qty: totalQty,
        weight: `${parseFloat(sealWeight.replace(',', '.')).toFixed(2)}kg`,
      });
      setGeneratedQRData(qrPayload);

      // Reset active box and seal modal
      setActiveBox(null);
      setSealWeight('');
      setShowSealModal(false);
      setShowQRModal(true);

    } catch (err: any) {
      Alert.alert(
        'Weight Validation Error',
        err.response?.data?.detail || 'Failed to seal box. Please check the weight.'
      );
    } finally {
      setIsSealing(false);
    }
  };

  // ─── Scan & missing handlers ───────────────────────────────────────────────

  const handleItemScanSubmit = (scannedBarcode?: string) => {
    const rawBarcode = typeof scannedBarcode === 'string' ? scannedBarcode : scanInput;
    if (!rawBarcode.trim() || !scanTargetItem) return;
    const barcode = rawBarcode.trim();

    if (barcode === scanTargetItem.barcode) {
      setScanModalVisible(false);
      setCameraScanned(false);
      setScanInput('');
      playTickSound();

      setQtyTargetItem(scanTargetItem);
      setQtyInput(''); // empty so user types their own value — no need to clear first
      setQtyModalVisible(true);
    } else {
      Alert.alert('Scan Failed', 'The scanned barcode does not match this item.', [
        { text: 'OK', onPress: () => setCameraScanned(false) },
      ]);
      setScanInput('');
    }
  };

  const handleMissing = async (itemId: string) => {
    if (isSubmitted) return;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, missing_reported: true } : i));
    try {
      await api.patch(`/picklists/${id}/items/${itemId}/report-missing`);
    } catch (err) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, missing_reported: false } : i));
    }
  };

  // ─── Complete job ──────────────────────────────────────────────────────────

  const handleComplete = () => {
    if (activeBox) {
      Alert.alert(
        'Unsealed Box',
        'You have an active box that has not been sealed. Please seal it before completing the job.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    setSubmitError('');
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post(`/picklists/${id}/complete-picking`);
      // Tell the jobs list this one is done before navigating, so it disappears
      // on arrival instead of lingering until the list's own refetch returns.
      markJobSubmitted(String(id));
      setShowConfirm(false);
      router.back();
    } catch (err: any) {
      setSubmitError(err.response?.data?.detail || 'Could not submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>

      {/* ── Header ── */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={24} color="#0b1c30" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-onSurface mb-0.5">
            {picklistInfo?.order_number || jobLabel}
          </Text>
          <Text className="text-sm text-gray-700 font-medium mb-1" numberOfLines={1}>
            {picklistInfo?.customer_name || 'Loading...'}
          </Text>
          <Text className="text-xs text-gray-500">
            {items.length} Items • {pickedCount} Picked • Seq: {jobLabel}
          </Text>
        </View>
      </View>

      {/* ── Start Picking Button / FIFO Message ── */}
      {picklistInfo?.status === 'assigned' && !isLoading && (
        <View className="px-4 py-3 bg-white border-b border-gray-200">
          {blockingJob ? (
            <View className="bg-yellow-50 p-4 border border-yellow-200 rounded-xl flex-row items-center gap-3">
              <Text className="text-yellow-800 font-bold flex-1 text-center">
                Please complete your previous picking job ({blockingJob}) first to unlock this order.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              className={`w-full py-4 rounded-xl items-center shadow-sm flex-row justify-center space-x-2 ${isStarting ? 'bg-gray-400' : 'bg-[#003527]'}`}
              disabled={isStarting}
              onPress={async () => {
                setIsStarting(true);
                try {
                  await api.patch(`/picklists/${id}/start`);
                  setPicklistInfo((prev: any) => ({...prev, status: 'picking'}));
                  const { useAuthStore } = require('../../../store/authStore');
                  useAuthStore.getState().setIsPicking(true);
                } catch (e: any) {
                  const msg = e.response?.data?.detail || 'Could not start picking';
                  Alert.alert('Hold on', typeof msg === 'string' ? msg : JSON.stringify(msg));
                } finally {
                  setIsStarting(false);
                }
              }}
            >
              {isStarting && <ActivityIndicator color="#fff" size="small" />}
              <Text className="text-white font-black text-base uppercase tracking-wider">
                {isStarting ? "Starting..." : "Start Picking"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Sealed Boxes Summary ── */}
      {sealedBoxes.length > 0 && (
        <TouchableOpacity 
          className="bg-[#f0faf5] border-b border-[#c6e8d8] px-4 py-3 flex-row items-center justify-between"
          onPress={() => setShowSealedListModal(true)}
        >
          <View className="flex-row items-center gap-2">
            <Package size={16} color="#006c49" />
            <Text className="text-sm font-bold text-[#006c49]">
              {sealedBoxes.length} Box{sealedBoxes.length > 1 ? 'es' : ''} Sealed
            </Text>
          </View>
          <Text className="text-[#006c49] text-xs font-semibold">View Details ›</Text>
        </TouchableOpacity>
      )}

      {/* ── Active Box Banner ── */}
      {activeBox && (
        <View className="bg-[#003527] px-4 py-3 flex-row items-center justify-between">
          {/* Left — tap to open Seal Box */}
          <TouchableOpacity
            className="flex-row items-center gap-2 flex-1"
            onPress={() => setShowSealModal(true)}
          >
            <Package size={18} color="#a7f3d0" />
            <View>
              <Text className="text-white font-bold text-sm">
                Active Box: {activeBox.carton_name}
              </Text>
              <Text className="text-[#a7f3d0] text-xs">
                {activeBox.contents.length} item line(s) · {activeBoxTotal} units staged
              </Text>
            </View>
          </TouchableOpacity>

          {/* Right — two actions: Change | Seal */}
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="bg-[#006c49] px-3 py-1.5 rounded-lg"
              onPress={() => {
                setCartonSelectMode('change');
                setShowCartonSelectModal(true);
              }}
            >
              <Text className="text-[#a7f3d0] text-xs font-bold">Change</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-[#003527] px-4 py-2 rounded flex-row items-center ml-2"
              onPress={handleOpenSealModal}
            >
              <Text className="text-[#a7f3d0] font-bold mr-1">SEAL</Text>
              <ChevronRight size={16} color="#a7f3d0" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Items List ── */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#006c49" />
          <Text className="text-gray-500 text-sm mt-3">Loading items...</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 110 + insets.bottom }}
          renderItem={({ item }) => (
            <PickItemRow
              item={item}
              onScanStart={() => {
                setScanTargetItem(item);
                setScanInput('');
                setCameraScanned(false);
                setScanMode('choice');
                setScanModalVisible(true);
              }}
              onMissing={() => handleMissing(item.id)}
              disabled={isSubmitted || picklistInfo?.status === 'assigned'}
            />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-12">
              <Text className="text-gray-500 text-sm">No items found for this job.</Text>
            </View>
          }
        />
      )}

      {/* ── Bottom Bar ── */}
      <View 
        className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-lg flex-row items-center justify-between"
        style={{ paddingBottom: Math.max(16, insets.bottom) }}
      >
        <View>
          <Text className="text-sm text-gray-500">Progress</Text>
          <Text className="text-lg font-bold text-onSurface">{pickedCount} / {items.length} Picked</Text>
        </View>

        {isSubmitted ? (
          <View className="bg-emerald-100 border border-emerald-300 px-4 py-3 rounded-xl flex-row items-center">
            <CheckCircle size={18} color="#006c49" />
            <Text className="font-extrabold text-[#006c49] ml-2 text-xs uppercase tracking-wide">
              Submitted • In Audit
            </Text>
          </View>
        ) : (
          <View className="flex-row gap-2">
            {/* New Box button — green themed */}
            {hasLooseItems && !activeBox && hasUnboxedLooseItems && (
              <TouchableOpacity
                className="px-4 py-3 rounded-xl flex-row items-center bg-[#ecfdf5] border border-[#a7f3d0]"
                onPress={() => {
                  setCartonSelectMode('new');
                  setShowCartonSelectModal(true);
                }}
              >
                <Plus size={18} color="#006c49" />
                <Text className="font-bold ml-1 text-[#006c49]">New Box</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              className={`px-6 py-3 rounded-xl flex-row items-center ${isComplete ? 'bg-[#003527]' : 'bg-gray-200'}`}
              disabled={!isComplete || isSubmitting}
              onPress={handleComplete}
            >
              {isComplete && <CheckCircle2 size={20} color="white" />}
              <Text className={`font-bold ml-2 ${isComplete ? 'text-white' : 'text-gray-400'}`}>
                Complete Job
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Select Carton Type (shown when first loose item is hit, or Change tapped)
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCartonSelectModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-2xl">
            <View className="flex-row items-center mb-2">
              <Box size={22} color="#006c49" />
              <Text className="text-xl font-bold text-gray-800 ml-2">
                {cartonSelectMode === 'change' ? 'Change Box Type' : 'Select Box Type'}
              </Text>
            </View>
            <Text className="text-sm text-gray-500 mb-5">
              {cartonSelectMode === 'change'
                ? 'Select a different carton type. Items staged so far will be kept.'
                : 'Grab a physical box and select its type below to begin packing loose items.'}
            </Text>

            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              <View className="gap-3 mb-2">
              {cartonTypes.map(ct => (
                <TouchableOpacity
                  key={ct.id}
                  onPress={() => handleCartonSelect(ct)}
                  className={`flex-row items-center justify-between px-4 py-4 rounded-xl border ${
                    activeBox?.carton_type_id === ct.id
                      ? 'bg-[#ecfdf5] border-[#006c49]'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <View className="flex-row items-center gap-3">
                    <Package size={20} color={activeBox?.carton_type_id === ct.id ? '#006c49' : '#6b7280'} />
                    <View>
                      <Text className={`font-bold text-base ${activeBox?.carton_type_id === ct.id ? 'text-[#003527]' : 'text-gray-800'}`}>
                        {ct.name}
                        {activeBox?.carton_type_id === ct.id ? ' (current)' : ''}
                      </Text>
                      <Text className="text-xs text-gray-500">Tare weight: {ct.tare_weight} kg</Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color={activeBox?.carton_type_id === ct.id ? '#006c49' : '#9ca3af'} />
                </TouchableOpacity>
              ))}
              </View>
            </ScrollView>

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => {
                setShowCartonSelectModal(false);
                setPendingLooseItem(null);
              }}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Sealed Boxes List
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showSealedListModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-2xl max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-xl font-bold text-gray-800">Sealed Boxes</Text>
              <TouchableOpacity onPress={() => setShowSealedListModal(false)}>
                <Text className="text-gray-500 font-bold px-2 py-1">Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} className="mb-2">
              {sealedBoxes.map((b, idx) => (
                <View key={b.id} className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-3 flex-row items-center justify-between">
                  <View>
                    <Text className="font-extrabold text-gray-800 text-lg mb-1">BOX-{b.id}</Text>
                    <Text className="text-gray-500 text-xs">{b.carton_name}</Text>
                  </View>
                  <View className="items-end">
                    <View className="bg-[#e6f4ea] px-2 py-1 rounded mb-1">
                      <Text className="text-[#006c49] font-bold text-xs">{b.weight} kg</Text>
                    </View>
                    <Text className="text-gray-400 text-xs">{b.total_qty} units</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Seal Box — enter weight and confirm
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showSealModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-2xl">
            <Text className="text-xl font-bold text-gray-800 mb-1">Seal Box</Text>
            <Text className="text-sm text-gray-500 mb-4">
              {activeBox?.carton_name} · {activeBox?.contents.length} item line(s)
            </Text>

            {/* Show what's in this box — green themed */}
            <View className="bg-[#f0faf5] rounded-xl p-3 mb-4 border border-[#c6e8d8]">
              <Text className="text-xs font-bold text-[#006c49] mb-2 uppercase tracking-wide">Box Contents</Text>
              {activeBox?.contents.map((c, idx) => (
                <Text key={idx} className="text-sm text-[#003527]">
                  • {c.item_name} × {c.quantity}
                </Text>
              ))}
            </View>

            <View className="bg-amber-50 rounded-xl p-3 mb-4 border border-amber-100">
              <Text className="text-xs font-bold text-amber-700 tracking-wider mb-1">WEIGHT GUIDELINE</Text>
              
              {isEstimating ? (
                <ActivityIndicator color="#b45309" size="small" className="my-2" />
              ) : weightEstimate ? (
                <View className="mb-2 bg-amber-100/50 p-2 rounded">
                  <Text className="text-amber-800 text-xs mb-1 font-semibold">Estimated Breakdown:</Text>
                  {weightEstimate.breakdown?.map((b: any, idx: number) => (
                    <View key={idx} className="flex-row justify-between mb-0.5">
                      <Text className="text-amber-700 text-xs" numberOfLines={1} style={{maxWidth: '70%'}}>
                        {b.product_name} ({b.quantity})
                      </Text>
                      <Text className="text-amber-700 text-xs">{b.line_weight.toFixed(2)} kg</Text>
                    </View>
                  ))}
                  <View className="flex-row justify-between mb-0.5 border-b border-amber-200/60 pb-1 pt-1 mt-1">
                    <Text className="text-amber-700 text-xs">Carton Tare Weight</Text>
                    <Text className="text-amber-700 text-xs">+ {weightEstimate.tare_weight.toFixed(2)} kg</Text>
                  </View>
                  <View className="flex-row justify-between mt-1 pt-0.5">
                    <Text className="text-amber-800 text-xs font-bold">Total Expected Gross</Text>
                    <Text className="text-amber-800 text-xs font-bold">{weightEstimate.expected_weight.toFixed(2)} kg</Text>
                  </View>
                </View>
              ) : null}

              <Text className="text-amber-700 text-xs mt-1">
                Place the sealed box on the scale and enter the gross weight (box + items). ±0.5% tolerance allowed.
              </Text>
            </View>

            <Text className="text-sm font-semibold text-gray-500 mb-2">Gross Weight (kg)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5 text-xl font-bold text-center"
              placeholder="e.g. 5.25"
              keyboardType="decimal-pad"
              value={sealWeight}
              onChangeText={setSealWeight}
              autoFocus
            />

            <TouchableOpacity
              className="bg-[#003527] py-4 rounded-xl items-center mb-3"
              onPress={handleSealBox}
              disabled={isSealing || !sealWeight}
            >
              {isSealing
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-bold text-base">✓ Seal &amp; Print Label</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => { setShowSealModal(false); setSealWeight(''); }}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Confirm Complete Job
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-6 w-full shadow-xl border border-gray-100">
            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-full bg-[#ecfdf5] border-2 border-[#a7f3d0] items-center justify-center">
                <CheckCircle2 size={34} color="#006c49" />
              </View>
            </View>
            <Text className="text-lg font-extrabold text-[#003527] text-center mb-1">
              Submit {jobLabel}?
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-5 leading-5">
              Confirm that all {items.length} items have been physically collected and verified from the warehouse floor.
            </Text>

            {submitError ? (
              <Text className="text-xs text-red-600 text-center mb-3 bg-red-50 p-2 rounded-xl">
                {submitError}
              </Text>
            ) : null}

            <TouchableOpacity
              className="bg-[#003527] py-4 rounded-2xl items-center mb-3"
              onPress={confirmSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-extrabold text-base">✓ Confirm & Submit to Admin</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-2xl items-center border border-gray-200"
              onPress={() => { setShowConfirm(false); setSubmitError(''); }}
              disabled={isSubmitting}
            >
              <Text className="text-gray-600 font-semibold">Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: QR Code after box sealed
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
          <ScrollView
            style={{ width: '100%' }}
            contentContainerStyle={{ alignItems: 'center', paddingVertical: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
          <View style={{ backgroundColor: 'white', borderRadius: 24, padding: 20, width: '100%', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10, borderWidth: 1, borderColor: '#f3f4f6' }}>
            <View style={{ marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' }}>✅ Box Sealed</Text>
              <Text style={{ fontSize: 13, color: '#6b7280', textAlign: 'center', marginTop: 2 }}>Label physically printed at packing station.</Text>
            </View>

            {/* QR capture view — fixed width, auto height, no aspectRatio that breaks small screens */}
            <View
              ref={qrViewRef}
              collapsable={false}
              style={{ backgroundColor: 'white', paddingHorizontal: 20, paddingVertical: 24, alignItems: 'center', borderWidth: 3, borderColor: '#f3f4f6', width: '100%', borderRadius: 8 }}
            >
              {generatedQRData && (
                <>
                  <View style={{ width: '100%', alignItems: 'center', marginBottom: 20 }}>
                    <Text style={{ fontWeight: '900', fontSize: 22, color: '#111827', textAlign: 'center', textTransform: 'uppercase' }}>
                      {JSON.parse(generatedQRData).customer}
                    </Text>
                    <Text style={{ fontWeight: '700', color: '#6b7280', fontSize: 14, textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
                      {JSON.parse(generatedQRData).lpo_no}
                    </Text>
                    <View style={{ backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999, marginTop: 8 }}>
                      <Text style={{ fontWeight: '700', color: '#374151', fontSize: 15 }}>
                        {JSON.parse(generatedQRData).carton}
                      </Text>
                    </View>
                  </View>

                  <QRCode
                    value={generatedQRData}
                    size={200}
                    color="black"
                    backgroundColor="white"
                  />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 20, paddingTop: 16, borderTopWidth: 2, borderTopColor: '#f3f4f6', paddingHorizontal: 8 }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Total Items</Text>
                      <Text style={{ color: '#1f2937', fontSize: 22, fontWeight: '900' }}>{JSON.parse(generatedQRData).total_qty}</Text>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 }}>Gross Weight</Text>
                      <Text style={{ color: '#1f2937', fontSize: 22, fontWeight: '900' }}>{JSON.parse(generatedQRData).weight}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            <TouchableOpacity
              style={{ backgroundColor: '#003527', width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16, flexDirection: 'row', justifyContent: 'center' }}
              onPress={handleShareQR}
            >
              <Text style={{ color: 'white', fontWeight: '800', fontSize: 15 }}>Download / Share QR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, flexDirection: 'row', justifyContent: 'center', backgroundColor: '#003527' }}
              onPress={() => {
                setShowQRModal(false);
                if (isComplete) {
                  setShowConfirm(true);
                }
              }}
            >
              <CheckCircle size={18} color="white" />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 15, marginLeft: 8 }}>Done — Continue Picking</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Item Scan
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={scanModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-xl">
            <Text className="text-xl font-bold text-onSurface mb-2">Verify Item</Text>
            <Text className="text-sm text-gray-500 mb-1">
              Item: <Text className="font-bold text-gray-800">{scanTargetItem?.name}</Text>
            </Text>
            {scanTargetItem && !scanTargetItem.is_full_carton && (
              <View className="bg-[#f0faf5] border border-[#c6e8d8] rounded-lg px-3 py-2 mb-4">
                <Text className="text-xs text-[#006c49] font-semibold">
                  📦 Loose Item — {activeBox ? `Going into: ${activeBox.carton_name}` : 'Will prompt for box selection'}
                </Text>
              </View>
            )}
            {!scanTargetItem?.is_full_carton ? null : <View className="mb-4" />}

            {scanMode === 'choice' && (
              <View className="gap-3 mb-6">
                <TouchableOpacity
                  className="bg-emerald-50 border border-emerald-200 py-4 rounded-xl flex-row justify-center items-center"
                  onPress={() => setScanMode('camera')}
                >
                  <Scan size={20} color="#059669" />
                  <Text className="text-emerald-700 font-bold text-base ml-2">Scan QR / Barcode</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="bg-gray-50 border border-gray-200 py-4 rounded-xl flex-row justify-center items-center"
                  onPress={() => setScanMode('manual')}
                >
                  <Text className="text-gray-700 font-bold text-base">Type Manually</Text>
                </TouchableOpacity>
              </View>
            )}

            {scanMode === 'manual' && (
              <>
                <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6 flex-row items-center">
                  <Scan size={18} color="#6b7280" />
                  <TextInput
                    className="flex-1 text-base text-gray-800 ml-2"
                    placeholder="Enter barcode..."
                    value={scanInput}
                    onChangeText={setScanInput}
                    onSubmitEditing={() => handleItemScanSubmit()}
                    returnKeyType="done"
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  className="bg-[#003527] py-4 rounded-xl items-center mb-3"
                  onPress={() => handleItemScanSubmit()}
                >
                  <Text className="text-white font-bold text-base">Verify</Text>
                </TouchableOpacity>
              </>
            )}

            {scanMode === 'camera' && (
              <View className="mb-6">
                {!permission ? (
                  <View className="w-full h-64 bg-gray-900 rounded-2xl items-center justify-center mb-4">
                    <ActivityIndicator color="white" />
                  </View>
                ) : !permission.granted ? (
                  <View className="w-full h-64 bg-gray-900 rounded-2xl items-center justify-center mb-4 p-4">
                    <AlertCircle size={32} color="#fca5a5" />
                    <Text className="text-white text-center font-bold mb-4 mt-2">Camera access required</Text>
                    <TouchableOpacity className="bg-white px-4 py-2 rounded-xl" onPress={requestPermission}>
                      <Text className="font-bold text-gray-900">Grant Permission</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View className="w-full h-64 bg-black rounded-2xl overflow-hidden mb-4 relative">
                    <CameraView
                      style={{ flex: 1 }}
                      facing="back"
                      barcodeScannerSettings={{
                        barcodeTypes: ['qr', 'ean13', 'ean8', 'pdf417', 'aztec', 'datamatrix', 'code39', 'code128', 'upc_a', 'upc_e'],
                      }}
                      onBarcodeScanned={cameraScanned ? undefined : (result) => {
                        setCameraScanned(true);
                        setScanInput(result.data);
                        handleItemScanSubmit(result.data);
                      }}
                    />
                    <View className="absolute inset-0 items-center justify-center pointer-events-none">
                      <View className="w-48 h-48 border-2 border-[#10b981]/80 rounded-xl" style={{ borderStyle: 'dashed' }} />
                    </View>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => {
                if (scanMode !== 'choice') {
                  setScanMode('choice');
                } else {
                  setScanModalVisible(false);
                  setScanTargetItem(null);
                  setScanInput('');
                }
              }}
            >
              <Text className="text-gray-500 font-semibold">
                {scanMode === 'choice' ? 'Cancel' : 'Go Back'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════
          MODAL: Quantity Entry
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={qtyModalVisible} animationType="fade" transparent>
        <View className="flex-1 bg-black/60 justify-center px-6">
          <View className="bg-white rounded-3xl p-6 shadow-xl">
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-[#ecfdf5] rounded-full items-center justify-center mb-4">
                <Box size={28} color="#006c49" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center mb-1">
                Enter Picked Quantity
              </Text>
              <Text className="text-sm text-gray-500 text-center">
                Requested: {qtyTargetItem?.qty} {qtyTargetItem?.uom}
              </Text>
              {qtyTargetItem && !qtyTargetItem.is_full_carton && activeBox && (
                <Text className="text-xs text-[#006c49] font-semibold mt-1">
                  → Will go into: {activeBox.carton_name}
                </Text>
              )}
            </View>

            <View className="flex-row items-center bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3 mb-6">
              <TextInput
                className="flex-1 text-lg text-center font-bold text-gray-800"
                keyboardType="numeric"
                value={qtyInput}
                onChangeText={setQtyInput}
                autoFocus
                selectTextOnFocus
              />
            </View>

            <TouchableOpacity
              className="bg-[#003527] py-4 rounded-xl items-center mb-3"
              onPress={handleQtySubmit}
            >
              <Text className="text-white font-bold text-base">Confirm Quantity</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => {
                setQtyModalVisible(false);
                setQtyTargetItem(null);
              }}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
