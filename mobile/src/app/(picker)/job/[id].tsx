import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, ActivityIndicator, TextInput, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, CheckCircle2, Box, Scan, AlertCircle, Package, Plus, ChevronRight } from 'lucide-react-native';
import PickItemRow from '../../../components/PickItemRow';
import { playTickSound } from '../../../lib/alertSound';
import api from '../../../lib/api';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  // ── Data state ──
  const [items, setItems] = useState<PickItem[]>([]);
  const [picklistInfo, setPicklistInfo] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [cartonTypes, setCartonTypes] = useState<CartonType[]>([]);

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
  const [pendingLooseItem, setPendingLooseItem] = useState<PickItem | null>(null); // item waiting for box selection

  // ── Seal box modal state ──
  const [showSealModal, setShowSealModal] = useState(false);
  const [sealWeight, setSealWeight] = useState('');
  const [isSealing, setIsSealing] = useState(false);

  // ── QR modal state ──
  const [showQRModal, setShowQRModal] = useState(false);
  const [generatedQRData, setGeneratedQRData] = useState<any>(null);

  // ─── Load data ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchPicklistDetails = async () => {
      try {
        setIsLoading(true);
        const res = await api.get(`/picklists/${id}`);
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
        }
      } catch (err) {
        setSubmitError('Could not load picklist from server.');
      } finally {
        setIsLoading(false);
      }
    };

    const fetchCartonTypes = async () => {
      try {
        const res = await api.get('/catalogue/cartons');
        setCartonTypes(res.data || []);
      } catch (err) {}
    };

    fetchPicklistDetails();
    fetchCartonTypes();
  }, [id]);

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
  const hasUnboxedLooseItems = looseItems.some(i => i.picked && !i.missing_reported);

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

    // For loose items: if no active box yet, show carton select first
    if (!qtyTargetItem.is_full_carton && !activeBox) {
      setPendingLooseItem({ ...qtyTargetItem, picked_qty: val });
      setShowCartonSelectModal(true);
      return;
    }

    // Optimistic update
    setItems(prev =>
      prev.map(i => i.id === qtyTargetItem.id ? { ...i, picked: true, picked_qty: val } : i)
    );

    try {
      await api.patch(`/picklists/${id}/items/${qtyTargetItem.id}/pick`, { picked_quantity: val });
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
    // Create the new active box
    const newBox: ActiveBox = {
      carton_type_id: carton.id,
      carton_name: carton.name,
      contents: [],
    };
    setActiveBox(newBox);

    // Now process the pending loose item that triggered the carton select
    if (pendingLooseItem) {
      const item = pendingLooseItem;
      const qty = item.picked_qty;

      // Optimistic UI update for picked status
      setItems(prev =>
        prev.map(i => i.id === item.id ? { ...i, picked: true, picked_qty: qty } : i)
      );
      api.patch(`/picklists/${id}/items/${item.id}/pick`, { picked_quantity: qty }).catch(() => {
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, picked: false, picked_qty: 0 } : i)
        );
        Alert.alert('Error', 'Failed to update quantity');
      });

      // Add to the newly created box
      if (qty > 0) {
        setActiveBox({
          ...newBox,
          contents: [{ item_id: parseInt(item.id), quantity: qty, item_name: item.name }],
        });
      }
      setPendingLooseItem(null);
    }
  };

  // ─── Seal box ──────────────────────────────────────────────────────────────

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

      // Success: generate QR and show it
      const qrPayload = JSON.stringify({
        box_id: `BOX-${res.data.id}`,
        job: jobLabel,
        carton: activeBox.carton_name,
        items: activeBox.contents.length,
        weight: `${parseFloat(sealWeight).toFixed(2)}kg`,
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
      setQtyInput(String(scanTargetItem.qty)); // default to requested qty
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
    setSubmitError('');
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post(`/picklists/${id}/complete-picking`);
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

      {/* ── Active Box Banner ── */}
      {activeBox && (
        <TouchableOpacity
          className="bg-blue-600 px-4 py-3 flex-row items-center justify-between"
          onPress={() => setShowSealModal(true)}
        >
          <View className="flex-row items-center gap-2">
            <Package size={18} color="white" />
            <View>
              <Text className="text-white font-bold text-sm">
                Active Box: {activeBox.carton_name}
              </Text>
              <Text className="text-blue-100 text-xs">
                {activeBox.contents.length} item line(s) · {activeBoxTotal} units staged
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <Text className="text-white font-bold text-sm">SEAL BOX</Text>
            <ChevronRight size={16} color="white" />
          </View>
        </TouchableOpacity>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 110 }}
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
              disabled={isSubmitted}
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
      <View className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-lg flex-row items-center justify-between">
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
            {/* Show "New Box" button if picker has loose items but no active box and some are picked */}
            {hasLooseItems && !activeBox && hasUnboxedLooseItems && (
              <TouchableOpacity
                className="px-4 py-3 rounded-xl flex-row items-center bg-blue-100 border border-blue-200"
                onPress={() => setShowCartonSelectModal(true)}
              >
                <Plus size={18} color="#1d4ed8" />
                <Text className="font-bold ml-1 text-blue-700">New Box</Text>
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
          MODAL: Select Carton Type (shown when first loose item is hit)
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showCartonSelectModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-2xl">
            <View className="flex-row items-center mb-2">
              <Box size={22} color="#1d4ed8" />
              <Text className="text-xl font-bold text-gray-800 ml-2">Select Box Type</Text>
            </View>
            <Text className="text-sm text-gray-500 mb-5">
              Grab a physical box and select its type below to begin packing loose items.
            </Text>

            <View className="gap-3 mb-6">
              {cartonTypes.map(ct => (
                <TouchableOpacity
                  key={ct.id}
                  onPress={() => handleCartonSelect(ct)}
                  className="flex-row items-center justify-between bg-gray-50 border border-gray-200 px-4 py-4 rounded-xl"
                >
                  <View className="flex-row items-center gap-3">
                    <Package size={20} color="#1d4ed8" />
                    <View>
                      <Text className="font-bold text-gray-800 text-base">{ct.name}</Text>
                      <Text className="text-xs text-gray-500">Tare weight: {ct.tare_weight} kg</Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color="#9ca3af" />
                </TouchableOpacity>
              ))}
            </View>

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
          MODAL: Seal Box — enter weight and confirm
      ════════════════════════════════════════════════════════════════ */}
      <Modal visible={showSealModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-2xl">
            <Text className="text-xl font-bold text-gray-800 mb-1">Seal Box</Text>
            <Text className="text-sm text-gray-500 mb-4">
              {activeBox?.carton_name} · {activeBox?.contents.length} item line(s)
            </Text>

            {/* Show what's in this box */}
            <View className="bg-blue-50 rounded-xl p-3 mb-4 border border-blue-100">
              <Text className="text-xs font-bold text-blue-700 mb-2 uppercase tracking-wide">Box Contents</Text>
              {activeBox?.contents.map((c, idx) => (
                <Text key={idx} className="text-sm text-blue-900">
                  • {c.item_name} × {c.quantity}
                </Text>
              ))}
            </View>

            <View className="bg-amber-50 rounded-xl p-3 mb-4 border border-amber-100">
              <Text className="text-xs font-bold text-amber-700 tracking-wider mb-1">WEIGHT GUIDELINE</Text>
              <Text className="text-amber-700 text-sm">
                Place the sealed box on the scale and enter the gross weight (box + items). ±5% tolerance allowed.
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
              className="bg-blue-600 py-4 rounded-xl items-center mb-3"
              onPress={handleSealBox}
              disabled={isSealing || !sealWeight}
            >
              {isSealing
                ? <ActivityIndicator color="white" />
                : <Text className="text-white font-bold text-base">✓ Seal & Print Label</Text>
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
        <View className="flex-1 bg-black/60 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-8 w-full shadow-2xl items-center border border-gray-100">
            <View className="w-16 h-16 rounded-full bg-emerald-50 mb-4 items-center justify-center">
              <CheckCircle2 size={32} color="#10b981" />
            </View>
            <Text className="text-xl font-extrabold text-onSurface mb-2 text-center">
              Box Label Generated!
            </Text>
            <Text className="text-sm text-gray-500 text-center mb-6">
              Weight verified. Print and stick this label on the box.
            </Text>

            <View className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
              {generatedQRData && (
                <QRCode
                  value={generatedQRData}
                  size={180}
                  color="black"
                  backgroundColor="white"
                />
              )}
            </View>

            <TouchableOpacity
              className="bg-gray-100 w-full py-3 rounded-xl border border-gray-200 items-center mb-3"
              onPress={() => Share.share({ message: `Box Label: ${generatedQRData}` })}
            >
              <Text className="text-gray-700 font-bold text-sm">Share Label</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="bg-[#003527] w-full py-4 rounded-2xl items-center flex-row justify-center"
              onPress={() => {
                setShowQRModal(false);
                // If all loose items are now boxed and all items picked, prompt to complete
                if (isComplete) {
                  setShowConfirm(true);
                }
              }}
            >
              <CheckCircle size={18} color="white" />
              <Text className="text-white font-bold text-base ml-2">Done — Continue Picking</Text>
            </TouchableOpacity>
          </View>
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
              <View className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
                <Text className="text-xs text-blue-700 font-semibold">
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
              <View className="w-16 h-16 bg-blue-100 rounded-full items-center justify-center mb-4">
                <Box size={28} color="#2563eb" />
              </View>
              <Text className="text-xl font-bold text-gray-900 text-center mb-1">
                Enter Picked Quantity
              </Text>
              <Text className="text-sm text-gray-500 text-center">
                Requested: {qtyTargetItem?.qty} {qtyTargetItem?.uom}
              </Text>
              {qtyTargetItem && !qtyTargetItem.is_full_carton && activeBox && (
                <Text className="text-xs text-blue-600 font-semibold mt-1">
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
              className="bg-[#2563eb] py-4 rounded-xl items-center mb-3"
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
