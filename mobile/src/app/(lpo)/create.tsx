import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Modal, Alert, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, Plus, Trash2, QrCode, Share, Search } from 'lucide-react-native';
import { useAuthStore } from '../../store/authStore';
import api, { TIMEOUT, describeApiError } from '../../lib/api';
import { getCatalogue } from '../../lib/catalogueCache';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import MultiPhotoModal from '../../components/MultiPhotoModal';

interface CatalogueItem {
 id: number;
 primary_barcode: string;
 name: string;
 max_order_quantity: number | null;
}

interface CartItem {
 id: number;
 barcode: string;
 product_name: string;
 quantity: number;
 max_order_quantity: number | null;
 unit: string;
}

/**
 * Random key identifying one logical order, sent as `Idempotency-Key`.
 *
 * It stays the same across every retry of the same order so the server can
 * recognise a repeat and return the order it already created. A new one is
 * minted only when the form is reset for a genuinely new order.
 *
 * Deliberately not derived from the LPO number: that is only `LPO-YYYYMMDD-`
 * plus four random digits, so two genuinely different orders collide often
 * enough that using it as a dedupe key would merge them.
 */
const generateIdempotencyKey = () =>
 `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
  .toString(36)
  .slice(2, 10)}`;

const generateAutoLpoNumber = () => {
 const d = new Date();
 const yyyy = d.getFullYear();
 const mm = String(d.getMonth() + 1).padStart(2, '0');
 const dd = String(d.getDate()).padStart(2, '0');
 const rnd = Math.floor(1000 + Math.random() * 9000);
 return `LPO-${yyyy}${mm}${dd}-${rnd}`;
};

const CartItemRow = React.memo(({ item, removeItem, decrementQuantity, updateQuantity, validateQuantityOnBlur, incrementQuantity }: any) => {
 return (
  <View className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm mb-3 flex-col">
   <View className="flex-row justify-between items-start mb-3">
    <View className="flex-1 pr-2">
     <Text className="font-bold text-gray-800 text-sm mb-1">{item.product_name}</Text>
     <Text className="text-xs text-gray-500 font-semibold bg-gray-100 self-start px-2 py-0.5 rounded-md">{item.barcode}</Text>
    </View>
    <TouchableOpacity onPress={() => removeItem(item.id)} className="p-2 bg-rose-50 rounded-lg">
     <Trash2 size={16} color="#ef4444" />
    </TouchableOpacity>
   </View>
   
   <View className="flex-row items-center justify-end border-t border-gray-100 pt-3">
    <View className="flex-row items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
     <TouchableOpacity onPress={() => decrementQuantity(item.id)} className="px-3 py-2 bg-white">
      <Text className="font-black text-gray-600 text-lg leading-5">-</Text>
     </TouchableOpacity>
     <TextInput
      className="w-12 text-center font-black text-sm bg-white h-full border-x border-gray-200"
      keyboardType="number-pad"
      value={item.quantity === '' ? '' : String(item.quantity)}
      onChangeText={(val) => updateQuantity(item.id, val)}
      onBlur={() => validateQuantityOnBlur(item.id)}
      selectTextOnFocus
     />
     <TouchableOpacity onPress={() => incrementQuantity(item.id)} className="px-3 py-2 bg-white">
      <Text className="font-black text-gray-600 text-lg leading-5">+</Text>
     </TouchableOpacity>
    </View>
   </View>
  </View>
 );
});

export default function LpoCreateScreen() {
 const { logout, picker } = useAuthStore();
 const router = useRouter();
 const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
 const [cart, setCart] = useState<CartItem[]>([]);
 const [customers, setCustomers] = useState<any[]>([]);
 const [customerName, setCustomerName] = useState('');
 const [orderNumber, setOrderNumber] = useState(generateAutoLpoNumber());
 const [deliveryDate, setDeliveryDate] = useState<Date | undefined>(undefined);
 const [showDatePicker, setShowDatePicker] = useState(false);
 
 const [showItemModal, setShowItemModal] = useState(false);
 const [showCustomerModal, setShowCustomerModal] = useState(false);
 const [search, setSearch] = useState('');
 const [customerSearch, setCustomerSearch] = useState('');
 const [debouncedSearch, setDebouncedSearch] = useState('');
 const [customersLoading, setCustomersLoading] = useState(false);
 
 // SUCCESS MODAL STATE
 const [successModalVisible, setSuccessModalVisible] = useState(false);
 const [isGenerating, setIsGenerating] = useState(false);
 const [isUploading, setIsUploading] = useState(false);
 const [isConfirmed, setIsConfirmed] = useState(false);
 // Set when the order saved but its signed document did not. The order exists
 // and is listed in History; it is simply not confirmed into the warehouse yet.
 const [pendingAttachment, setPendingAttachment] = useState(false);
 const [selectedLpoFile, setSelectedLpoFile] = useState<any>(null);
 // Held across retries so a repeated submit is recognised as the same order.
 const idempotencyKeyRef = useRef(generateIdempotencyKey());
 const [refreshing, setRefreshing] = useState(false);
 const [isSharing, setIsSharing] = useState(false);
 const [hasDownloadedPDF, setHasDownloadedPDF] = useState(false);
 const [showCameraModal, setShowCameraModal] = useState(false);

 const [quantityModalVisible, setQuantityModalVisible] = useState(false);
 const [selectedItemForQuantity, setSelectedItemForQuantity] = useState<CatalogueItem | null>(null);
 const [tempQuantity, setTempQuantity] = useState('');

 // Debounce search input
 useEffect(() => {
  const timer = setTimeout(() => {
   setDebouncedSearch(customerSearch);
  }, 300);
  return () => clearTimeout(timer);
 }, [customerSearch]);

 const fetchCatalogue = async () => {
  try {
   // Served from the shared cache: instant on every visit after the first, and
   // refreshed in the background when stale.
   const items = await getCatalogue(setCatalogue);
   setCatalogue(items);
  } catch (err) {
   // Handle error quietly
  }
 };

 const fetchCustomers = async (searchQuery: string = '') => {
  try {
   setCustomersLoading(true);
   const endpoint = searchQuery ? `/customers?q=${encodeURIComponent(searchQuery)}` : '/customers';
   const custRes = await api.get(endpoint, { timeout: TIMEOUT.customers });
   setCustomers(custRes.data || []);
  } catch (err) {
   console.log('Error fetching customers:', err);
  } finally {
   setCustomersLoading(false);
  }
 };

 useEffect(() => {
  fetchCatalogue();
 }, []);

 useEffect(() => {
  fetchCustomers(debouncedSearch);
 }, [debouncedSearch]);

 const onRefresh = async () => {
  setRefreshing(true);
  await Promise.all([fetchCatalogue(), fetchCustomers(debouncedSearch)]);
  setRefreshing(false);
 };

 const handleLogout = async () => {
  await logout();
 };

 
 const handleSelectFromCatalogue = (item: any) => {
  const existing = cart.find(c => 
   (c.id && item.id && c.id === item.id) || 
   (c.barcode && item.primary_barcode && c.barcode === item.primary_barcode)
  );
  if (existing) {
   Alert.alert('Already Added', 'This item is already in the LPO. You can adjust its quantity from the list.');
   return;
  }
  
  setSelectedItemForQuantity(item);
  setTempQuantity('');
  setQuantityModalVisible(true);
 };

 const confirmQuantity = () => {
  if (!selectedItemForQuantity) return;
  let qty = parseInt(tempQuantity, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  
  const maxQty = selectedItemForQuantity.max_order_quantity;
  if (maxQty !== null && maxQty !== undefined && qty > maxQty) {
   Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
   return;
  }

  setCart([...cart, { 
   id: selectedItemForQuantity.id, 
   barcode: selectedItemForQuantity.primary_barcode || '', 
   product_name: selectedItemForQuantity.name, 
   quantity: qty, 
   max_order_quantity: selectedItemForQuantity.max_order_quantity, 
   unit: 'PCS' 
  }]);
  
  setQuantityModalVisible(false);
  setSelectedItemForQuantity(null);
  setShowItemModal(false);
  setSearch('');
 };

 const removeItem = useCallback((id: number) => {
  setCart(prev => prev.filter(c => c.id !== id));
 }, []);

 const updateQuantity = useCallback((id: number, qtyStr: string) => {
  setCart(prev => prev.map(c => {
   if (c.id !== id) return c;
   const cleanStr = qtyStr.replace(/[^0-9]/g, '').replace(/^0+/, '');
   if (cleanStr === '') return { ...c, quantity: '' as any };
   let qty = parseInt(cleanStr, 10);
   if (isNaN(qty)) return c;
   const maxQty = c.max_order_quantity;
   if (maxQty !== null && maxQty !== undefined && qty > maxQty) {
    Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
    qty = maxQty;
   }
   return { ...c, quantity: qty };
  }));
 }, []);

 const validateQuantityOnBlur = useCallback((id: number) => {
  setCart(prev => prev.map(c => {
   if (c.id !== id) return c;
   if (!c.quantity || c.quantity < 1) return { ...c, quantity: 1 };
   return c;
  }));
 }, []);

 const incrementQuantity = useCallback((id: number) => {
  setCart(prev => prev.map(c => {
   if (c.id !== id) return c;
   const maxQty = c.max_order_quantity;
   if (maxQty !== null && maxQty !== undefined && c.quantity + 1 > maxQty) {
    Alert.alert('Limit Exceeded', `Cannot order more than ${maxQty} of this item.`);
    return c;
   }
   return { ...c, quantity: c.quantity + 1 };
  }));
 }, []);

 const decrementQuantity = useCallback((id: number) => {
  setCart(prev => prev.map(c => {
   if (c.id !== id) return c;
   if (c.quantity > 1) return { ...c, quantity: c.quantity - 1 };
   return c;
  }));
 }, []);

 const reviewOrder = () => {
  if (!customerName.trim() || !orderNumber.trim()) {
   Alert.alert('Validation Error', 'Please enter a customer name and LPO number.');
   return;
  }
  if (cart.length === 0) {
   Alert.alert('Validation Error', 'Please add at least one item to the LPO.');
   return;
  }
  
  setSuccessModalVisible(true);
  setIsConfirmed(false);
  setSelectedLpoFile(null);
 };

 /**
  * Save the order, then attach its signed document.
  *
  * These are two independent steps on purpose. They used to share one
  * try/catch, so a document upload that ran out of time was reported as
  * "Failed to confirm LPO" even though the order had already been saved — and
  * tapping Confirm again created a second copy of it.
  *
  * Now step 1 either succeeds or fails on its own, and a failure in step 2
  * leaves the saved order alone and says so.
  */
 const executeOrderCreation = async (fileToUpload?: any) => {
  const file = fileToUpload || selectedLpoFile;

  // ── Step 1: save the order ───────────────────────────────────────────────
  let createdLpo: any;
  try {
   setIsGenerating(true);
   const payload: any = {
    lpo_number: orderNumber.trim(),
    customer_name: customerName.trim(),
    source: 'mobile',
    items: cart.map(c => ({
     barcode: c.barcode,
     quantity: parseInt(String(c.quantity)) || 1,
     unit: c.unit,
     product_name: c.product_name
    }))
   };
   if (deliveryDate) {
    payload.delivery_date = deliveryDate.toISOString();
   }

   const res = await api.post('/lpos', payload, {
    timeout: TIMEOUT.createOrder,
    // Repeating this request returns the order it already made rather than
    // creating another, so retrying after a network problem is safe.
    headers: { 'Idempotency-Key': idempotencyKeyRef.current },
   });
   createdLpo = res.data;
  } catch (err) {
   const failure = describeApiError(err, 'Could not save the order. Please try again.');
   Alert.alert('Order Not Saved', failure.message);
   setIsGenerating(false);
   return;
  }

  // ── Step 2: attach the signed document ───────────────────────────────────
  // The order is saved from here on. Nothing below may discard it.
  if (!file) {
   setIsConfirmed(true);
   setIsGenerating(false);
   return;
  }

  try {
   const formData = new FormData();
   formData.append('file', {
    uri: file.uri,
    name: file.filename,
    type: file.mimeType,
   } as any);

   await api.post(`/lpos/${createdLpo.id}/upload-pdf`, formData, {
    timeout: TIMEOUT.uploadLpo,
   });

   setIsConfirmed(true);
  } catch (err) {
   const failure = describeApiError(err, 'The signed LPO could not be uploaded.');
   setPendingAttachment(true);
   Alert.alert(
    'Order Created',
    `${failure.message}\n\nThe order has been saved and is in your History, but it is not confirmed until the signed LPO is attached. Open it from History to attach it.`
   );
  } finally {
   setIsGenerating(false);
  }
 };

 const handleConfirmOrder = () => {
  executeOrderCreation();
 };

 const handleCloseSuccess = () => {
  setSuccessModalVisible(false);
  if (isConfirmed) {
   resetFormExplicitly();
  }
  // Otherwise keep everything exactly as it is. Clearing hasDownloadedPDF and
  // selectedLpoFile here used to mean that a network failure cost the user the
  // printed PDF and every photo they had taken — they had to redo all of it
  // before the Confirm button would even reappear.
 };

 const resetFormExplicitly = () => {
  setSuccessModalVisible(false);
  setCart([]);
  setCustomerName('');
  setDeliveryDate(undefined);
  setOrderNumber(generateAutoLpoNumber());
  setSelectedLpoFile(null);
  setIsConfirmed(false);
  setPendingAttachment(false);
  // A genuinely new order, so it needs its own replay key.
  idempotencyKeyRef.current = generateIdempotencyKey();
  setHasDownloadedPDF(false);
 };

 const confirmResetOrder = () => {
  Alert.alert(
   "Reset Order",
   "Are you sure you want to clear the current order? All selected items will be lost.",
   [
    { text: "Cancel", style: "cancel" },
    { text: "Reset", style: "destructive", onPress: resetFormExplicitly }
   ]
  );
 };




 const handleUploadLpoPdf = async () => {
  setShowCameraModal(true);
 };

 const handleConfirmPhotos = (fileData: any) => {
  setSelectedLpoFile(fileData);
  setShowCameraModal(false);
  Alert.alert('✅ Success', 'LPO Photos attached successfully!');
 };

 const handleCameraClose = () => {
  setShowCameraModal(false);
 };


  const handleDownloadPDF = async (share: boolean = false) => {
  if (isSharing) return;
  try {
   setIsSharing(true);
   const d = new Date();
   const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
   const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
   const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);

   const itemRows = cart.map((item) => (
    `<tr>
      <td class="cell">${item.product_name}</td>
      <td class="cell center">${item.unit || ''}</td>
      <td class="cell center">${item.quantity}</td>
    </tr>`
   )).join('');

   const htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    @page { size: A4; margin: 20mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 14px; width: 100%; color: #000; background: #fff; line-height: 1.5; }
    .center { text-align: center; }
    .header-table { width: 100%; border: none; margin-bottom: 30px; }
    .header-table td { border: none; padding: 8px 0; font-size: 14px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
    .items-table th, .items-table td { border: 1px solid #000; padding: 10px; text-align: left; }
    .items-table th { font-weight: bold; }
    .footer-table { width: 100%; border: none; margin-top: 50px; }
    .footer-table td { border: none; padding: 8px 0; font-size: 14px; }
   </style></head><body>
    
    <div style="text-align: center; margin-bottom: 40px; font-family: Arial, sans-serif;">
      <h2 style="margin: 0; font-size: 18px; font-weight: bold; color: #000;">GAZAL AL KHADARA TRADING CO LLC - (VAT NO :OM1100024353)</h2>
      <p style="margin: 4px 0; font-size: 14px; color: #000;">Al-suwaiq , North Batinah,Sultanate of oman 315,489</p>
      <p style="margin: 4px 0; font-size: 14px; color: #000; font-weight: bold;"><span style="text-decoration: underline;">E-mail :gazalsales@gmail.com ,sales@gazalfoods.net </span></p>
      <h3 style="margin: 8px 0 0 0; font-size: 15px; font-weight: bold; text-decoration: underline; color: #000;">NORMAL ORDER FORM</h3>
    </div>

    <table class="header-table">
      <tr>
        <td style="width: 50%;">Date: <strong>${dateStr}</strong></td>
        <td style="width: 50%;">LPO ref no. <strong>${orderNumber}</strong></td>
      </tr>
      <tr>
        <td>Customer name: <strong>${customerName}</strong></td>
        <td>Delivery Date: <strong>${deliveryDate ? deliveryDate.toISOString().split('T')[0] : ''}</strong></td>
      </tr>
    </table>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th class="center" style="width: 20%;">Qty / CTN</th>
          <th class="center" style="width: 20%;">Order Qty</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <table class="footer-table">
      <tr>
        <td style="width: 50%;">Merchandiser name : <strong>${picker?.full_name || '___________________'}</strong></td>
        <td style="width: 50%;">Customer Signature ___________________</td>
      </tr>
    </table>

   </body></html>`;

   const { uri } = await Print.printToFileAsync({ html: htmlContent, base64: false });
   if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
   } else {
    await Print.printAsync({ html: htmlContent });
   }
  } catch (err: any) {
   console.error(err);
   if (err.message && err.message.includes('Another share request')) {
     return; // Silently ignore consecutive share taps
   }
   Alert.alert('Error', 'Failed to generate LPO PDF.');
  } finally {
   setIsSharing(false);
   if (share) {
    setHasDownloadedPDF(true);
   }
  }
 };

 const filteredCatalogue = catalogue.filter(c => 
  !cart.some(cartItem => 
   (cartItem.id && c.id && cartItem.id === c.id) || 
   (cartItem.barcode && c.primary_barcode && cartItem.barcode === c.primary_barcode)
  ) &&
  (c.name.toLowerCase().includes(search.toLowerCase()) || 
  (c.primary_barcode || '').toLowerCase().includes(search.toLowerCase()))
 );

 const filteredCustomers = customers.filter(c => 
  (c?.name || '').toLowerCase().includes(customerSearch.toLowerCase()) || 
  (c?.customer_code || '').toLowerCase().includes(customerSearch.toLowerCase())
 );

 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
   {/* Header */}
   <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row justify-between items-center shadow-sm z-10">
    <View>
     <Text className="text-xl font-black text-onSurface ">Create Order</Text>
     <Text className="text-xs text-primary font-bold mt-0.5">Welcome, {picker?.full_name}</Text>
    </View>
      <View className="flex-row gap-2">
       <TouchableOpacity onPress={confirmResetOrder} className="bg-rose-50 p-2.5 rounded-xl border border-rose-100 mr-1">
        <Text className="font-bold text-rose-700 text-xs">Reset Order</Text>
       </TouchableOpacity>
       <TouchableOpacity onPress={() => router.push('/history')} className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
        <Text className="font-bold text-emerald-700 text-xs">My Orders</Text>
       </TouchableOpacity>
       <TouchableOpacity onPress={handleLogout} className="bg-rose-50 p-2.5 rounded-xl border border-rose-100">
        <LogOut size={18} color="#e11d48" />
       </TouchableOpacity>
      </View>
   </View>

   {/* Main Form */}
   <View className="flex-1 p-4">
    <View className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4">
     <Text className="text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Customer Name</Text>
     <TouchableOpacity 
      className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3 flex-row items-center justify-between"
      onPress={() => setShowCustomerModal(true)}
     >
      <Text className={` text-base font-semibold flex-1 ${customerName ? 'text-gray-800' : 'text-gray-400'}`}>
       {customerName || 'Select Customer'}
      </Text>
      <Search size={16} color="#9ca3af" />
     </TouchableOpacity>
     <Text className="text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">Delivery Date (Optional)</Text>
     <TouchableOpacity 
      className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-3"
      onPress={() => setShowDatePicker(true)}
     >
      <Text className={` text-base font-semibold ${deliveryDate ? 'text-gray-800' : 'text-gray-400'}`}>
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
     <Text className="text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider">LPO Number (Auto-Generated)</Text>
     <TextInput
      className="bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 font-semibold"
      placeholder="LPO-XXXXX"
      value={orderNumber}
      onChangeText={setOrderNumber}
      editable={false}
     />
    </View>

    <View className="flex-row justify-between items-center mb-3 px-1">
     <Text className="text-sm font-black text-gray-800 uppercase tracking-wide">Line Items ({cart.length})</Text>
    </View>

    <FlatList
     data={cart}
     keyExtractor={(item, index) => item.id ? item.id.toString() : (item.barcode || `temp-${index}`)}
     className="flex-1"
     showsVerticalScrollIndicator={false}
     refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#003527"]} tintColor="#006c49" />}
     initialNumToRender={15}
     maxToRenderPerBatch={10}
     windowSize={5}
     renderItem={({ item }) => (
      <CartItemRow 
       item={item}
       removeItem={removeItem}
       decrementQuantity={decrementQuantity}
       updateQuantity={updateQuantity}
       validateQuantityOnBlur={validateQuantityOnBlur}
       incrementQuantity={incrementQuantity}
      />
     )}
     ListEmptyComponent={
      <View className="items-center justify-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
       <Text className="text-gray-400 text-sm font-semibold">No items added to LPO yet.</Text>
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
     onPress={reviewOrder}
    >
     <Text className="text-white font-black text-base uppercase tracking-widest">
      Print and Save
     </Text>
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
        className="flex-1 py-3 px-2 text-base font-semibold text-gray-800"
        placeholder="Search by name or barcode..."
        value={search}
        onChangeText={setSearch}
        autoFocus
       />
      </View>
     </View>
     <FlatList
      data={filteredCatalogue}
      keyExtractor={(item, index) => item.id ? item.id.toString() : (item.primary_barcode || `cat-${index}`)}
      renderItem={({ item }) => (
       <TouchableOpacity
        className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
        onPress={() => handleSelectFromCatalogue(item)}
       >
        <View className="flex-1 pr-4">
         <Text className="font-bold text-gray-800 text-base mb-1">{item.name}</Text>
         <Text className="text-xs text-gray-500 font-semibold">{item.primary_barcode}</Text>
        </View>
       </TouchableOpacity>
      )}
     />
    </SafeAreaView>
   </Modal>

   {/* Quantity Modal */}
   <Modal visible={quantityModalVisible} transparent animationType="fade">
    <View className="flex-1 bg-black/50 justify-center items-center p-6">
     <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
      <Text className="text-xl font-black text-gray-800 text-center mb-2">Enter Quantity</Text>
      <Text className="text-sm text-gray-500 text-center mb-6" numberOfLines={2}>
       {selectedItemForQuantity?.name}
      </Text>
      
      <TextInput
       className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center text-3xl font-black text-gray-800 mb-6"
       keyboardType="number-pad"
       value={tempQuantity}
       onChangeText={(val) => setTempQuantity(val.replace(/[^0-9]/g, '').replace(/^0+/, ''))}
       autoFocus
       selectTextOnFocus
      />
      
      <View className="flex-row gap-3">
       <TouchableOpacity 
        onPress={() => setQuantityModalVisible(false)}
        className="flex-1 p-4 rounded-xl bg-gray-100 items-center justify-center"
       >
        <Text className="font-bold text-gray-600 text-base">Cancel</Text>
       </TouchableOpacity>
       <TouchableOpacity 
        onPress={confirmQuantity}
        className="flex-1 p-4 rounded-xl bg-[#003527] items-center justify-center"
       >
        <Text className="font-bold text-white text-base">Confirm</Text>
       </TouchableOpacity>
      </View>
     </View>
    </View>
   </Modal>

   {/* Customer Selection Modal */}
   <Modal visible={showCustomerModal} animationType="slide" presentationStyle="pageSheet">
    <SafeAreaView className="flex-1 bg-white">
     <View className="p-4 border-b border-gray-200 flex-row justify-between items-center">
      <Text className="text-lg font-black text-gray-800">Select Customer</Text>
      <TouchableOpacity onPress={() => setShowCustomerModal(false)} className="px-2 py-1">
       <Text className="text-primary font-bold text-base">Close</Text>
      </TouchableOpacity>
     </View>
     <View className="p-4 border-b border-gray-100 bg-gray-50">
      <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-4">
       <Search size={18} color="#9ca3af" />
       <TextInput
        className="flex-1 py-3 px-2 text-base font-semibold text-gray-800"
        placeholder="Search by name or code..."
        value={customerSearch}
        onChangeText={setCustomerSearch}
        autoFocus
       />
      </View>
     </View>
     <FlatList
      data={filteredCustomers}
      keyExtractor={item => item.id.toString()}
      renderItem={({ item }) => (
       <TouchableOpacity
        className="px-4 py-4 border-b border-gray-100 flex-row justify-between items-center hover:bg-gray-50"
        onPress={() => {
         setCustomerName(item.name);
         setShowCustomerModal(false);
         setCustomerSearch('');
        }}
       >
        <View className="flex-1 pr-4">
         <Text className="font-bold text-gray-800 text-base mb-1">{item.name}</Text>
         <Text className="text-xs text-gray-500 font-semibold">{item.customer_code}</Text>
        </View>
        <View className="w-8 h-8 rounded-full bg-emerald-50 items-center justify-center border border-emerald-200">
         <Plus size={16} color="#059669" />
        </View>
       </TouchableOpacity>
      )}
      ListEmptyComponent={
       <View className="p-8 items-center justify-center">
        {customersLoading ? (
          <ActivityIndicator size="small" color="#059669" />
        ) : (
          <Text className="text-gray-400 text-sm font-semibold text-center">No customers found.</Text>
        )}
       </View>
      }
     />
    </SafeAreaView>
   </Modal>

   {/* Success Modal */}
   <Modal visible={successModalVisible} transparent animationType="slide">
    <View className="flex-1 bg-black/60 justify-center items-center p-6">
     <View className="bg-white rounded-3xl p-6 w-full max-w-sm">
      <View className="items-center mb-6">
       {isConfirmed ? (
        <>
         <View className="w-16 h-16 bg-emerald-100 rounded-full items-center justify-center mb-4">
          <Text className="text-emerald-600 text-2xl">✓</Text>
         </View>
         <Text className="text-2xl font-black text-slate-800 text-center">Confirmed!</Text>
         <Text className="text-slate-500 text-center mt-2">LPO <Text className="font-bold text-slate-700">{orderNumber}</Text> has been submitted for WM Review.</Text>
        </>
       ) : (
        <>
         <View className="w-16 h-16 bg-blue-100 rounded-full items-center justify-center mb-4">
          <Search size={32} color="#2563eb" />
         </View>
         <Text className="text-2xl font-black text-slate-800 text-center">Review Order</Text>
         <Text className="text-slate-500 text-center mt-2">Order <Text className="font-bold text-slate-700">{orderNumber}</Text> is ready for review.</Text>
        </>
       )}
      </View>

      <View className="gap-3">
        {pendingAttachment && !isConfirmed && (
          <View className="w-full p-3 rounded-xl bg-amber-50 border border-amber-200">
            <Text className="font-bold text-amber-800 text-sm text-center">
              Order saved — signed LPO not attached
            </Text>
            <Text className="text-amber-700 text-xs text-center mt-1">
              It is in your History. Tap Confirm Order to try attaching again, or attach it later from History.
            </Text>
          </View>
        )}

        <TouchableOpacity
         onPress={() => handleDownloadPDF(true)}
         disabled={isSharing}
         className={`w-full p-4 rounded-xl items-center justify-center flex-row gap-2 ${isSharing ? 'bg-slate-200' : 'bg-slate-100'}`}
        >
         {isSharing ? <ActivityIndicator color="#334155" /> : <Text className="font-bold text-slate-700 text-base">🖨️ Print and Save</Text>}
        </TouchableOpacity>

        {!isConfirmed && hasDownloadedPDF && (
         <>
          <TouchableOpacity
           onPress={handleUploadLpoPdf}
           className="w-full p-4 rounded-xl bg-blue-50 border border-blue-200 items-center justify-center flex-row gap-2"
          >
           <Text className="font-bold text-blue-700 text-base">
            {selectedLpoFile ? `📎 Photos Attached` : '📷 Take Photos of Signed LPO (Optional)'}
           </Text>
          </TouchableOpacity>

          <TouchableOpacity
           onPress={() => executeOrderCreation(selectedLpoFile)}
           disabled={isGenerating}
           className="w-full p-4 rounded-xl bg-[#003527] items-center justify-center flex-row gap-2"
          >
           {isGenerating ? (
            <>
             <ActivityIndicator color="white" />
             <Text className="font-bold text-white text-base ml-2">{selectedLpoFile ? 'Confirming...' : 'Saving...'}</Text>
            </>
           ) : (
             <Text className="font-bold text-white text-base">
               {pendingAttachment ? '🔄 Retry Attaching LPO' : selectedLpoFile ? '✅ Confirm Order' : '💾 Save Order'}
             </Text>
           )}
          </TouchableOpacity>
         </>
        )}

        {!isConfirmed && !hasDownloadedPDF && (
          <View className="p-2 items-center">
            <Text className="text-sm text-slate-400 text-center">Download the LPO to attach photos and confirm</Text>
          </View>
        )}

        {isConfirmed ? (
         <TouchableOpacity 
          onPress={resetFormExplicitly}
          className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2 mt-2"
         >
          <Text className="font-bold text-slate-700 text-base">➕ Create New Order</Text>
         </TouchableOpacity>
        ) : (
         <TouchableOpacity 
          onPress={handleCloseSuccess}
          className="w-full p-4 rounded-xl bg-slate-100 items-center justify-center flex-row gap-2 mt-2"
         >
          <Text className="font-bold text-slate-500 text-base">Cancel & Edit</Text>
         </TouchableOpacity>
        )}
       </View>
      </View>
     </View>
    </Modal>
    
    <MultiPhotoModal 
      key={orderNumber}
      visible={showCameraModal} 
      onClose={handleCameraClose} 
      onConfirm={handleConfirmPhotos} 
    />
  </SafeAreaView>
 );
}
