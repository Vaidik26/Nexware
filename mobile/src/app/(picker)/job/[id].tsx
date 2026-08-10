import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, Modal, ActivityIndicator, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, CheckCircle, CheckCircle2, Box, Scan, AlertCircle } from 'lucide-react-native';
import PickItemRow from '../../../components/PickItemRow';
import { playTickSound } from '../../../lib/alertSound';
import api from '../../../lib/api';
import QRCode from 'react-native-qrcode-svg';

export default function JobDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [picklistInfo, setPicklistInfo] = useState<any>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitError, setSubmitError] = useState('');
  
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanTargetItem, setScanTargetItem] = useState<any>(null);
  const [scanInput, setScanInput] = useState('');
  
  const [showBoxModal, setShowBoxModal] = useState(false);
  const [cartonTypes, setCartonTypes] = useState<any[]>([]);
  const [selectedCartonType, setSelectedCartonType] = useState<number | null>(null);
  const [boxWeight, setBoxWeight] = useState('');
  const [isBoxing, setIsBoxing] = useState(false);
  
  const [showQRModal, setShowQRModal] = useState(false);
  const [generatedQRData, setGeneratedQRData] = useState<any>(null);

  useEffect(() => {
    const fetchPicklistDetails = async () => {
      try {
        setIsLoading(true);
        const res = await api.get(`/picklists/${id}`);
        if (res && res.data) {
          setPicklistInfo(res.data);
          const mappedItems = (res.data.items || []).map((item: any) => ({
            id: String(item.id),
            barcode: item.barcode || 'N/A',
            name: item.product_name || 'Item',
            qty: item.quantity || 1,
            uom: item.unit || 'EA',
            picked: item.is_picked || false,
            missing_reported: item.missing_reported || false
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

  const pickedCount = items.filter(i => i.picked).length;
  const isComplete = items.length > 0 && pickedCount === items.length;

  // Generate P-XXX label for the header
  const jobNum = picklistInfo.picker_job_number;
  const jobLabel = jobNum
    ? `P-${String(jobNum).padStart(3, '0')}`
    : id ? `P-${String(id).padStart(3, '0')}` : 'Job';

  const isSubmitted = picklistInfo?.status === 'waiting_verification' || picklistInfo?.status === 'verified' || picklistInfo?.status === 'completed';

  const toggleItem = async (itemId: string) => {
    if (isSubmitted) return;
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, picked: !i.picked } : i));
    try {
      await api.patch(`/picklists/${id}/items/${itemId}/pick`);
    } catch (err) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, picked: !i.picked } : i));
    }
  };

  const handleItemScanSubmit = () => {
    if (!scanInput.trim() || !scanTargetItem) return;
    const barcode = scanInput.trim();
    
    if (barcode === scanTargetItem.barcode) {
      toggleItem(scanTargetItem.id);
      setScanModalVisible(false);
      setScanTargetItem(null);
      setScanInput('');
      playTickSound();
    } else {
      Alert.alert('Scan Failed', 'The scanned barcode does not match this item.');
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

  const createBox = async () => {
    if (!selectedCartonType || !boxWeight) {
      Alert.alert('Error', 'Please select carton type and enter weight');
      return;
    }
    
    // Get loose items (picked but not missing) - for simplicity we just box all picked items that aren't already in a box
    // Wait, the API takes item_ids. The user wants to box loose items. We assume all picked items are loose until boxed.
    const looseItemIds = items.filter(i => i.picked && !i.missing_reported && !i.box_id).map(i => parseInt(i.id));
    if (looseItemIds.length === 0) {
      Alert.alert('Error', 'No loose items available to box');
      return;
    }

    setIsBoxing(true);
    try {
      const res = await api.post(`/picklists/${id}/boxes`, {
        carton_type_id: selectedCartonType,
        item_ids: looseItemIds,
        entered_weight: parseFloat(boxWeight)
      });
      
      // Update local state to mark them as boxed
      setItems(prev => prev.map(i => looseItemIds.includes(parseInt(i.id)) ? { ...i, box_id: res.data.id } : i));
      setShowBoxModal(false);
      setSelectedCartonType(null);
      setBoxWeight('');
      
      // Generate dummy QR details for demo
      const qrPayload = JSON.stringify({
        box_id: `BOX-${res.data.id}`,
        job: jobLabel,
        items: looseItemIds.length,
        weight: `${parseFloat(boxWeight).toFixed(2)}kg`
      });
      setGeneratedQRData(qrPayload);
      setShowQRModal(true);
      
    } catch (err: any) {
      Alert.alert('Weight Validation Error', err.response?.data?.detail || 'Failed to create box');
    } finally {
      setIsBoxing(false);
    }
  };

  const unboxedPickedCount = items.filter(i => i.picked && !i.missing_reported && !i.box_id).length;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-200">
        <TouchableOpacity onPress={() => router.back()} className="mr-3">
          <ArrowLeft size={24} color="#0b1c30" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-lg font-bold text-onSurface font-inter">{jobLabel}</Text>
          <Text className="text-xs text-gray-500 font-inter">
            {items.length} Items • {pickedCount} Picked
          </Text>
        </View>
        {!isSubmitted && (
          <TouchableOpacity onPress={() => setShowBoxModal(true)} className="bg-[#003527] px-3 py-1.5 rounded-lg flex-row items-center">
            <Box size={16} color="white" />
            <Text className="text-white text-xs font-bold ml-1 font-inter">Box Items</Text>
            {unboxedPickedCount > 0 && (
              <View className="absolute -top-2 -right-2 bg-red-500 w-5 h-5 rounded-full items-center justify-center">
                <Text className="text-white text-[10px] font-bold">{unboxedPickedCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>



      {/* Items List */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#006c49" />
          <Text className="text-gray-500 font-inter text-sm mt-3">Loading items...</Text>
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
                setScanModalVisible(true);
              }} 
              onMissing={() => handleMissing(item.id)}
              disabled={isSubmitted} 
            />
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-12">
              <Text className="text-gray-500 font-inter text-sm">No items found for this job.</Text>
            </View>
          }
        />
      )}

      {/* Bottom Bar */}
      <View className="absolute bottom-0 left-0 right-0 bg-white p-4 border-t border-gray-200 shadow-lg flex-row items-center justify-between">
        <View>
          <Text className="text-sm text-gray-500 font-inter">Progress</Text>
          <Text className="text-lg font-bold text-onSurface font-inter">{pickedCount} / {items.length} Picked</Text>
        </View>
        {isSubmitted ? (
          <View className="bg-emerald-100 border border-emerald-300 px-4 py-3 rounded-xl flex-row items-center">
            <CheckCircle size={18} color="#006c49" />
            <Text className="font-extrabold text-[#006c49] ml-2 font-inter text-xs uppercase tracking-wide">
              Submitted • In Audit
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            className={`px-6 py-3 rounded-xl flex-row items-center ${isComplete ? 'bg-[#003527]' : 'bg-gray-200'}`}
            disabled={!isComplete || isSubmitting}
            onPress={handleComplete}
          >
            {isComplete && <CheckCircle size={20} color="white" />}
            <Text className={`font-bold ml-2 font-inter ${isComplete ? 'text-white' : 'text-gray-400'}`}>
              Complete
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Custom Green Confirm Modal */}
      <Modal visible={showConfirm} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-6 w-full shadow-xl border border-gray-100">
            {/* Icon */}
            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-full bg-[#ecfdf5] border-2 border-[#a7f3d0] items-center justify-center">
                <CheckCircle2 size={34} color="#006c49" />
              </View>
            </View>

            <Text className="text-lg font-extrabold text-[#003527] font-inter text-center mb-1">
              Submit {jobLabel}?
            </Text>
            <Text className="text-sm text-gray-500 font-inter text-center mb-5 leading-5">
              Confirm that all {items.length} items have been physically collected and verified from the warehouse floor.
            </Text>

            {submitError ? (
              <Text className="text-xs text-red-600 font-inter text-center mb-3 bg-red-50 p-2 rounded-xl">
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
                <Text className="text-white font-extrabold font-inter text-base">
                  ✓ Confirm & Submit to Admin
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-2xl items-center border border-gray-200"
              onPress={() => { setShowConfirm(false); setSubmitError(''); }}
              disabled={isSubmitting}
            >
              <Text className="text-gray-600 font-semibold font-inter">Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Box Creation Modal */}
      <Modal visible={showBoxModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-xl">
            <Text className="text-xl font-bold text-onSurface mb-4">Pack Loose Items</Text>
            
            <Text className="text-sm font-semibold text-gray-500 mb-2">Select Carton Type</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {cartonTypes.map(ct => (
                <TouchableOpacity 
                  key={ct.id} 
                  onPress={() => setSelectedCartonType(ct.id)}
                  className={`px-4 py-2 rounded-xl border ${selectedCartonType === ct.id ? 'bg-primary border-primary' : 'bg-gray-50 border-gray-200'}`}
                >
                  <Text className={`font-semibold ${selectedCartonType === ct.id ? 'text-white' : 'text-gray-700'}`}>{ct.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="text-sm font-semibold text-gray-500 mb-2">Measured Weight (kg)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6 font-inter text-base"
              placeholder="e.g. 5.5"
              keyboardType="decimal-pad"
              value={boxWeight}
              onChangeText={setBoxWeight}
            />

            <TouchableOpacity
              className="bg-[#003527] py-4 rounded-xl items-center mb-3"
              onPress={createBox}
              disabled={isBoxing || !selectedCartonType || !boxWeight}
            >
              {isBoxing ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">Create Box</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => setShowBoxModal(false)}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* QR Code Demo Modal */}
      <Modal visible={showQRModal} transparent animationType="fade">
        <View className="flex-1 bg-black/60 items-center justify-center px-6">
          <View className="bg-white rounded-3xl p-8 w-full shadow-2xl items-center border border-gray-100">
            <View className="w-16 h-16 rounded-full bg-emerald-50 mb-4 items-center justify-center">
              <CheckCircle2 size={32} color="#10b981" />
            </View>
            <Text className="text-xl font-extrabold text-onSurface mb-2 font-inter text-center">
              Carton Label Generated
            </Text>
            <Text className="text-sm text-gray-500 font-inter text-center mb-6">
              Weight successfully verified. Print this label and apply it to the carton.
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

            <View className="w-full bg-gray-50 p-4 rounded-xl mb-6">
              <Text className="text-xs text-gray-500 font-inter text-center mb-1">DATA PAYLOAD</Text>
              <Text className="text-xs font-mono text-gray-700 text-center">
                {generatedQRData}
              </Text>
            </View>

            <TouchableOpacity
              className="bg-[#003527] w-full py-4 rounded-2xl items-center"
              onPress={() => setShowQRModal(false)}
            >
              <Text className="text-white font-bold text-base font-inter">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Item Scan Modal */}
      <Modal visible={scanModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 w-full shadow-xl">
            <Text className="text-xl font-bold text-onSurface mb-2">Scan Barcode</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Please scan the barcode for: <Text className="font-bold text-gray-800">{scanTargetItem?.name}</Text>
            </Text>
            
            <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-6 flex-row items-center">
              <Scan size={18} color="#6b7280" className="mr-2" />
              <TextInput
                className="flex-1 font-inter text-base text-gray-800"
                placeholder="Scan or enter barcode..."
                value={scanInput}
                onChangeText={setScanInput}
                onSubmitEditing={handleItemScanSubmit}
                returnKeyType="done"
                autoFocus
              />
            </View>

            <TouchableOpacity
              className="bg-[#003527] py-4 rounded-xl items-center mb-3"
              onPress={handleItemScanSubmit}
            >
              <Text className="text-white font-bold text-base">Verify Item</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="py-3 rounded-xl items-center"
              onPress={() => {
                setScanModalVisible(false);
                setScanTargetItem(null);
                setScanInput('');
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
