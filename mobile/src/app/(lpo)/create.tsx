import { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Plus, Trash2, QrCode, Share, Search } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

interface CatalogueItem {
  barcode: string;
  item_name: string;
  available_quantity: number;
}

interface CartItem {
  barcode: string;
  product_name: string;
  quantity: number;
  available_quantity: number;
  unit: string;
}

const generateAutoLpoNumber = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `LPO-${yyyy}${mm}${dd}-${rnd}`;
};

export default function LpoCreateScreen() {
  const { logout, picker } = useAuthStore();
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderNumber, setOrderNumber] = useState(generateAutoLpoNumber());
  const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [showItemModal, setShowItemModal] = useState(false);
  const [search, setSearch] = useState('');
  
  // SUCCESS MODAL STATE
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successLpoData, setSuccessLpoData] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPdfUploaded, setIsPdfUploaded] = useState(false);

  useEffect(() => {
    fetchCatalogue();
  }, []);

  const fetchCatalogue = async () => {
    try {
      const res = await api.get('/catalogue');
      setCatalogue(res.data || []);
    } catch (err) {
      // Handle error quietly
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const addToCart = (item: CatalogueItem) => {
    if (item.available_quantity <= 0) {
      Alert.alert('Out of Stock', 'This item is out of stock and cannot be added.');
      return;
    }
    const existing = cart.find(c => c.barcode === item.barcode);
    if (existing) {
      Alert.alert('Already Added', 'This item is already in the LPO. You can adjust its quantity from the list.');
      return;
    } else {
      setCart([...cart, { barcode: item.barcode, product_name: item.item_name, quantity: 1, available_quantity: item.available_quantity, unit: 'PCS' }]);
    }
    setShowItemModal(false);
    setSearch('');
  };

  const updateQuantity = (barcode: string, qtyStr: string) => {
    let qty = parseInt(qtyStr) || 0;
    const item = cart.find(c => c.barcode === barcode);
    if (item) {
      if (qty > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
        qty = item.available_quantity;
      }
      if (qty < 1) qty = 1;
      setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: qty } : c));
    }
  };

  const incrementQuantity = (barcode: string) => {
    const item = cart.find(c => c.barcode === barcode);
    if (item) {
      if (item.quantity + 1 > item.available_quantity) {
        Alert.alert('Stock Limit Exceeded', `Only ${item.available_quantity} available in stock.`);
      } else {
        setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: c.quantity + 1 } : c));
      }
    }
  };

  const decrementQuantity = (barcode: string) => {
    const item = cart.find(c => c.barcode === barcode);
    if (item && item.quantity > 1) {
      setCart(cart.map(c => c.barcode === barcode ? { ...c, quantity: c.quantity - 1 } : c));
    }
  };

  const removeItem = (barcode: string) => {
    setCart(cart.filter(c => c.barcode !== barcode));
  };

  const generateLPO = async () => {
    if (!customerName.trim() || !orderNumber.trim()) {
      Alert.alert('Validation Error', 'Please enter a customer name and LPO number.');
      return;
    }
    if (cart.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one item to the LPO.');
      return;
    }
    
    try {
      setIsGenerating(true);
      const payload: any = {
        lpo_number: orderNumber.trim(),
        customer_name: customerName.trim(),
        source: 'mobile',
        items: cart.map(c => ({
          barcode: c.barcode,
          quantity: c.quantity,
          unit: c.unit,
          product_name: c.product_name
        }))
      };
      if (deliveryDate) {
        payload.delivery_date = deliveryDate.toISOString();
      }

      const res = await api.post('/lpos', payload);
      
      const lpoData = res.data;
      setSuccessLpoData(lpoData);
      setSuccessModalVisible(true);
      
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail?.message || err.response?.data?.detail || 'Failed to generate LPO.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessModalVisible(false);
    setSuccessLpoData(null);
    setCart([]);
    setCustomerName('');
    setDeliveryDate(undefined);
    setOrderNumber(generateAutoLpoNumber());
    setIsPdfUploaded(false);
  };




  const handleUploadLpoPdf = async () => {
    if (!successLpoData?.id) {
      Alert.alert('Error', 'LPO ID not found.');
      return;
    }

    // Ask user: Camera or File?
    Alert.alert(
      'Upload LPO Document',
      'Choose how to attach the signed LPO:',
      [
        {
          text: '📷 Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera permission is required.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: false,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadFile(result.assets[0].uri, result.assets[0].mimeType || 'image/jpeg', `lpo-${orderNumber}.jpg`);
            }
          },
        },
        {
          text: '📎 Attach File',
          onPress: async () => {
            const result = await DocumentPicker.getDocumentAsync({
              type: ['application/pdf', 'image/*'],
              copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets[0]) {
              await uploadFile(result.assets[0].uri, result.assets[0].mimeType || 'application/pdf', result.assets[0].name);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadFile = async (uri: string, mimeType: string, filename: string) => {
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', {
        uri,
        name: filename,
        type: mimeType,
      } as any);

      await api.post(`/lpos/${successLpoData.id}/upload-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setIsPdfUploaded(true);
      Alert.alert('✅ LPO Confirmed!', 'Document uploaded. Your LPO is now submitted to the admin portal.');
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || err.message || 'Could not upload document.');
    } finally {
      setIsUploading(false);
    }
  };

    const handleDownloadPDF = async (share: boolean = false) => {
    try {
      const d = new Date();
      const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

      const itemRows = cart.map((item, idx) => (
        `<tr><td class="num">${idx + 1}</td><td class="desc">${item.product_name}</td><td class="bc">${item.barcode}</td><td class="uom">${item.unit}</td><td class="qty">${item.quantity}</td></tr>`
      )).join('');

      const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        @page { size: 80mm auto; margin: 4mm 3mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: 10px; width: 74mm; color: #000; background: #fff; }
        .center { text-align: center; }
        .header-company { font-size: 13px; font-weight: bold; text-align: center; margin-bottom: 2px; }
        .header-sub { font-size: 9px; text-align: center; margin-bottom: 4px; }
        .divider { border-top: 1px dashed #000; margin: 3px 0; }
        .thick-div { border-top: 2px solid #000; margin: 4px 0; }
        .field-row { display: flex; justify-content: space-between; margin: 1.5px 0; font-size: 10px; }
        .field-label { font-weight: bold; min-width: 65px; }
        .section-title { font-weight: bold; font-size: 11px; text-align: center; margin: 3px 0; text-transform: uppercase; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; margin: 3px 0; font-size: 9px; }
        th { font-weight: bold; border-bottom: 1px solid #000; padding: 2px 1px; text-align: left; }
        td { padding: 2px 1px; border-bottom: 1px dotted #ccc; vertical-align: top; }
        .num { width: 8%; text-align: center; }
        .desc { width: 42%; word-break: break-word; }
        .bc { width: 26%; font-size: 8px; color: #333; }
        .uom { width: 10%; text-align: center; }
        .qty { width: 14%; text-align: right; font-weight: bold; }
        .total-row { display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; margin: 1px 0; }
        .footer { font-size: 8px; text-align: center; margin-top: 6px; color: #444; }
        .status-box { border: 1px solid #000; padding: 3px 6px; margin: 4px 0; font-size: 9px; text-align: center; }
      </style></head><body>
        <div class="header-company">NOOR GHAZAL GENERAL TRADING LLC</div>
        <div class="header-sub">Dubai, UAE | Internal Warehouse Document</div>
        <div class="thick-div"></div>
        <div class="section-title">Local Purchase Order</div>
        <div class="thick-div"></div>
        <div class="field-row"><span class="field-label">LPO Ref:</span><span>${orderNumber}</span></div>
        <div class="field-row"><span class="field-label">Date:</span><span>${dateStr} ${timeStr}</span></div>
        <div class="field-row"><span class="field-label">Customer:</span><span>${customerName}</span></div>
        ${deliveryDate ? `<div class="field-row"><span class="field-label">Delivery:</span><span>${deliveryDate.toISOString().split('T')[0]}</span></div>` : ''}
        <div class="field-row"><span class="field-label">Status:</span><span>${successLpoData?.picker_name ? 'Assigned' : 'PENDING'}</span></div>
        ${successLpoData?.picker_name ? `<div class="field-row"><span class="field-label">Picker:</span><span>${successLpoData.picker_name}</span></div>` : ''}
        <div class="thick-div"></div>
        <div class="section-title">Line Items (${cart.length})</div>
        <div class="divider"></div>
        <table><thead><tr>
          <th class="num">#</th><th class="desc">Description</th><th class="bc">Barcode</th><th class="uom">UOM</th><th class="qty">Qty</th>
        </tr></thead><tbody>${itemRows}</tbody></table>
        <div class="thick-div"></div>
        <div class="total-row"><span>Total Lines:</span><span>${cart.length}</span></div>
        <div class="total-row"><span>Total Qty:</span><span>${totalQty}</span></div>
        <div class="thick-div"></div>
        <div class="status-box"><strong>INTERNAL USE ONLY</strong><br/>Generated via NexWare Terminal</div>
        <div class="footer">* Please verify all items before dispatch *</div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } else {
        await Print.printAsync({ html: htmlContent });
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to generate LPO PDF.');
    }
  };

  const filteredCatalogue = catalogue.filter(c => 
    !cart.some(cartItem => cartItem.barcode === c.barcode) &&
    (c.item_name.toLowerCase().includes(search.toLowerCase()) || 
    c.barcode.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row justify-between items-center shadow-sm z-10">
        <View>
          <Text className="text-xl font-black text-onSurface font-inter">Create Order</Text>
          <Text className="text-xs text-primary font-bold font-inter mt-0.5">Welcome, {picker?.full_name}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
          <LogOut size={18} color="#e11d48" />
        </TouchableOpacity>
      </View>

      {/* Main Form */}
      <View className="flex-1 p-4">
        <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-inter uppercase tracking-wider">Customer Name</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 font-inter text-base text-gray-800 font-semibold"
            placeholder="e.g. Acme Corp"
            value={customerName}
            onChangeText={setCustomerName}
          />
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-inter uppercase tracking-wider">Delivery Date (Optional)</Text>
          <TouchableOpacity 
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3"
            onPress={() => setShowDatePicker(true)}
          >
            <Text className={`font-inter text-base font-semibold ${deliveryDate ? 'text-gray-800' : 'text-gray-400'}`}>
              {deliveryDate ? deliveryDate.toISOString().split('T')[0] : 'Select Date'}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={deliveryDate || new Date()}
              mode="date"
              display="default"
              onChange={(event: any, selectedDate?: Date) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  setDeliveryDate(selectedDate);
                }
              }}
            />
          )}
          <Text className="text-[11px] font-bold text-gray-500 mb-1 font-inter uppercase tracking-wider">LPO Number (Auto-Generated)</Text>
          <TextInput
            className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 font-inter text-base text-gray-800 font-semibold"
            placeholder="LPO-XXXXX"
            value={orderNumber}
            onChangeText={setOrderNumber}
            editable={false}
          />
        </View>

        <View className="flex-row justify-between items-center mb-3 px-1">
          <Text className="text-sm font-black text-gray-800 font-inter uppercase tracking-wide">Line Items ({cart.length})</Text>
        </View>

        <FlatList
          data={cart}
          keyExtractor={(item) => item.barcode}
          className="flex-1"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-3 flex-col">
              <View className="flex-row justify-between items-start mb-3">
                <View className="flex-1 pr-2">
                  <Text className="font-bold text-gray-800 text-sm mb-1">{item.product_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold bg-gray-100 self-start px-2 py-0.5 rounded-md">{item.barcode}</Text>
                </View>
                <TouchableOpacity onPress={() => removeItem(item.barcode)} className="p-2 bg-rose-50 rounded-lg">
                  <Trash2 size={16} color="#ef4444" />
                </TouchableOpacity>
              </View>
              
              <View className="flex-row items-center justify-between border-t border-gray-100 pt-3">
                <Text className="text-xs font-bold text-emerald-600">Stock: {item.available_quantity}</Text>
                <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                  <TouchableOpacity onPress={() => decrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">-</Text>
                  </TouchableOpacity>
                  <TextInput
                    className="w-12 text-center font-black text-sm bg-white h-full border-x border-gray-200"
                    keyboardType="number-pad"
                    value={String(item.quantity)}
                    onChangeText={(val) => updateQuantity(item.barcode, val)}
                  />
                  <TouchableOpacity onPress={() => incrementQuantity(item.barcode)} className="px-3 py-2 bg-white">
                    <Text className="font-black text-gray-600 text-lg leading-5">+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View className="items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
              <Text className="text-gray-400 font-inter text-sm font-semibold">No items added to LPO yet.</Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity 
              onPress={() => setShowItemModal(true)} 
              className="mt-2 bg-emerald-50 py-4 rounded-2xl flex-row items-center justify-center border border-emerald-200 border-dashed"
            >
              <Plus size={18} color="#059669" />
              <Text className="text-emerald-700 text-sm font-black ml-2 uppercase tracking-wider">Add Line Item</Text>
            </TouchableOpacity>
          }
        />
      </View>

      {/* Generate Button */}
      <View className="p-4 bg-white border-t border-gray-200">
        <TouchableOpacity
          className="bg-[#003527] py-4 rounded-2xl flex-row items-center justify-center shadow-md"
          onPress={generateLPO}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text className="text-white font-black text-base font-inter uppercase tracking-widest">Generate LPO & Print</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Item Selection Modal */}
      <Modal visible={showItemModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView className="flex-1 bg-white">
          <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
            <Text className="text-lg font-black text-gray-800">Select Product</Text>
            <TouchableOpacity onPress={() => setShowItemModal(false)} className="px-2 py-1">
              <Text className="text-primary font-bold text-base">Done</Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-100 bg-gray-50">
            <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4">
              <Search size={18} color="#9ca3af" />
              <TextInput
                className="flex-1 py-3 px-2 font-inter text-base font-semibold text-gray-800"
                placeholder="Search by name or barcode..."
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
          </View>
          <FlatList
            data={filteredCatalogue}
            keyExtractor={item => item.barcode}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
                onPress={() => addToCart(item)}
              >
                <View className="flex-1 pr-4">
                  <Text className="font-bold text-gray-800 text-base mb-1">{item.item_name}</Text>
                  <Text className="text-xs text-gray-500 font-semibold">{item.barcode}</Text>
                </View>
                <View className={`px-3 py-1.5 rounded-lg border ${item.available_quantity > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                  <Text className={`text-xs font-black ${item.available_quantity > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {item.available_quantity > 0 ? `${item.available_quantity} PCS` : 'Out of Stock'}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/60 justify-center items-center p-6">
          <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
            <View className="items-center mb-6">
              <View className="w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-4">
                <Text className="text-emerald-600 text-2xl">✓</Text>
              </View>
              <Text className="text-2xl font-black text-slate-800 text-center">Submitted!</Text>
              <Text className="text-slate-500 text-center mt-2">LPO <Text className="font-bold text-slate-700">{orderNumber}</Text> has been submitted for WM Review.</Text>
            </View>

            <View className="gap-3">
              {/* Step 1 - Download */}
              <TouchableOpacity 
                onPress={() => handleDownloadPDF(true)} 
                className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2"
              >
                <Text className="font-bold text-slate-700 text-base">⬇ Download PDF</Text>
              </TouchableOpacity>

              {/* Step 2 - Upload to confirm */}
              {!isPdfUploaded ? (
                <TouchableOpacity 
                  onPress={handleUploadLpoPdf} 
                  disabled={isUploading} 
                  className="w-full p-4 rounded-xl bg-emerald-600 items-center justify-center flex-row gap-2"
                >
                  {isUploading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="font-bold text-white text-base">⬆ Upload PDF & Confirm LPO</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View className="w-full p-4 rounded-xl bg-emerald-100 border border-emerald-300 items-center justify-center flex-row gap-2">
                  <Text className="font-bold text-emerald-700 text-base">✅ LPO Confirmed!</Text>
                </View>
              )}

              {/* Step 3 - New order (locked until PDF uploaded) */}
              <TouchableOpacity 
                onPress={isPdfUploaded ? handleCloseSuccess : undefined}
                disabled={!isPdfUploaded}
                className={`w-full p-4 rounded-xl items-center justify-center flex-row gap-2 ${isPdfUploaded ? 'bg-[#003527]' : 'bg-gray-300'}`}
              >
                <Text className={`font-bold text-base ${isPdfUploaded ? 'text-white' : 'text-gray-500'}`}>
                  {isPdfUploaded ? 'Create New Order' : '🔒 Upload PDF First'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
