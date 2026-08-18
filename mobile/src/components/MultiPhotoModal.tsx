import React, { useState, useEffect } from "react";
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Dimensions, Image, Modal
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { X, Check, Trash2, Camera, Plus, AlertCircle } from "lucide-react-native";
import * as Print from "expo-print";
import * as FileSystem from "expo-file-system";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PREVIEW_HEIGHT = SCREEN_WIDTH * 0.75;

export default function MultiPhotoModal({ visible, onClose, onConfirm }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (file: { uri: string; mimeType: string; filename: string }) => void;
}) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWarningPopup, setShowWarningPopup] = useState(false);
  const { top, bottom } = useSafeAreaInsets();

  // Reset on close
  useEffect(() => {
    if (!visible) {
      photos.forEach(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}));
      setPhotos([]);
      setIsProcessing(false);
      setShowWarningPopup(false);
    }
  }, [visible]);

  if (!visible) return null;

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Required", "Camera permission is needed to attach LPO photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      exif: false,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const src = result.assets[0].uri;
      // Copy to stable private cache (not gallery)
      const dir = `${FileSystem.cacheDirectory}lpo-photos/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const dest = `${dir}photo_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: src, to: dest });
      setPhotos(prev => [...prev, dest]);
    }
  };

  const removePhoto = (index: number) => {
    FileSystem.deleteAsync(photos[index], { idempotent: true }).catch(() => {});
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirmPress = () => {
    setShowWarningPopup(true);
  };

  const generatePDFAndConfirm = async () => {
    if (photos.length === 0) return;
    setShowWarningPopup(false);
    setIsProcessing(true);
    try {
      const base64List = await Promise.all(
        photos.map(uri => FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }))
      );
      const imgTags = base64List
        .map(b64 => `<img src="data:image/jpeg;base64,${b64}" />`)
        .join("");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>body{margin:0;padding:20px;background:#fff;} img { width: 100%; max-height: 90vh; object-fit: contain; margin-bottom: 20px; border-radius: 8px; display: block; page-break-inside: avoid; break-inside: avoid; }</style></head><body>${imgTags}</body></html>`;
      const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false });
      onConfirm({ uri: pdfUri, mimeType: "application/pdf", filename: `lpo-photos-${Date.now()}.pdf` });
      photos.forEach(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}));
      setPhotos([]);
      onClose();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "Failed to process photos. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <SafeAreaView style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ width: 40, height: 40, backgroundColor: "#f3f4f6", borderRadius: 20, alignItems: "center", justifyContent: "center" }}
            >
              <X color="#374151" size={20} />
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: "900", color: "#111827" }}>
              {photos.length === 0 ? "Take Photos" : `Review Photos (${photos.length})`}
            </Text>
            <View style={{ width: 80, alignItems: "flex-end" }}>
              {photos.length > 0 && (
                <TouchableOpacity
                  onPress={openCamera}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#003527", borderRadius: 10 }}
                >
                  <Plus color="white" size={14} />
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 13 }}>More</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Content */}
          {photos.length === 0 ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 40 }}>
              <TouchableOpacity
                onPress={openCamera}
                style={{
                  width: 100, height: 100, borderRadius: 50,
                  backgroundColor: "#003527",
                  alignItems: "center", justifyContent: "center",
                  elevation: 6,
                  shadowColor: "#003527", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
                }}
              >
                <Camera color="white" size={44} />
              </TouchableOpacity>
              <Text style={{ color: "#6b7280", fontSize: 14, textAlign: "center", lineHeight: 22 }}>
                Tap to open camera and take photos of the signed LPO
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {photos.map((uri, index) => (
                <View key={`${index}-${uri}`} style={{ borderRadius: 16, overflow: "hidden", position: "relative" }}>
                  <Image
                    source={{ uri }}
                    style={{ width: "100%", height: PREVIEW_HEIGHT, backgroundColor: "#f3f4f6" }}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() => removePhoto(index)}
                    style={{
                      position: "absolute", top: 10, right: 10,
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center",
                      elevation: 4,
                    }}
                  >
                    <Trash2 color="white" size={16} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Confirm Button (Only if photos exist) */}
          {photos.length > 0 && (
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: "#f3f4f6" }}>
              <TouchableOpacity
                onPress={handleConfirmPress}
                disabled={isProcessing}
                style={{ backgroundColor: "#003527", paddingVertical: 16, borderRadius: 14, alignItems: "center", justifyContent: "center" }}
              >
                {isProcessing
                  ? <ActivityIndicator color="white" />
                  : <Text style={{ color: "white", fontWeight: "900", fontSize: 16, letterSpacing: 1.5 }}>CONFIRM PHOTOS</Text>
                }
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>

        {/* Warning Popup */}
        {showWarningPopup && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", zIndex: 9999, paddingHorizontal: 24 }}>
            <View style={{ backgroundColor: "white", borderRadius: 20, padding: 24, width: "100%", alignItems: "center", elevation: 10 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#fee2e2", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <AlertCircle color="#ef4444" size={32} />
              </View>
              <Text style={{ fontSize: 20, fontWeight: "900", color: "#ef4444", marginBottom: 12, textAlign: "center" }}>
                Confirm Attachment
              </Text>
              <Text style={{ fontSize: 15, color: "#374151", textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
                Are you sure you want to attach these photos? <Text style={{ fontWeight: "700" }}>Once confirmed, the order will be permanently linked to these LPO photos.</Text>
              </Text>
              <View style={{ flexDirection: "row", gap: 12, width: "100%" }}>
                <TouchableOpacity
                  onPress={() => setShowWarningPopup(false)}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#f3f4f6", alignItems: "center" }}
                >
                  <Text style={{ color: "#374151", fontWeight: "800", fontSize: 15 }}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={generatePDFAndConfirm}
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#003527", alignItems: "center" }}
                >
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 15 }}>Accept</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
