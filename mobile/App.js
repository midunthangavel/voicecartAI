import React from 'react';
import { StyleSheet, View, SafeAreaView, StatusBar } from 'react-native';
import { VoiceSessionProvider, useVoiceSession } from './src/context/VoiceSessionContext';
import HeaderBar from './src/components/common/HeaderBar';
import ShortcutsBar from './src/components/common/ShortcutsBar';
import CircularWaveform from './src/components/visualizers/CircularWaveform';
import VoiceVisualizer from './src/components/visualizers/VoiceVisualizer';
import ConnectButton from './src/components/controls/ConnectButton';
import ControlBar from './src/components/controls/ControlBar';
import ConversationPanel from './src/components/conversation/ConversationPanel';
import MenuCatalogModal from './src/components/commerce/MenuCatalogModal';
import LiveCartDrawer from './src/components/commerce/LiveCartDrawer';
import DTMFKeypadModal from './src/components/controls/DTMFKeypadModal';
import { colors } from './src/theme/colors';

function MainVoiceScreen() {
  const {
    serverUrl,
    setServerUrl,
    PRODUCTION_SERVER,
    LOCAL_WIFI_SERVER,
    callState,
    transcript,
    cartItems,
    cartTotal,
    deliveryAddress,
    isRecording,
    isAiSpeaking,
    audioLevel,
    latencyMs,
    activeLanguage,
    catalog,
    isCatalogOpen,
    setIsCatalogOpen,
    isCartOpen,
    setIsCartOpen,
    isDTMFOpen,
    setIsDTMFOpen,
    startCall,
    endCall,
    toggleRecording,
    sendTextMessage,
    sendDTMFDigit,
    askForDish,
    toggleLanguage,
  } = useVoiceSession();

  const isActive = callState === 'active';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.surface} />

      {/* 1. Header Bar with Language & Server Switchers */}
      <HeaderBar
        serverUrl={serverUrl}
        onSelectServer={setServerUrl}
        activeLanguage={activeLanguage}
        onToggleLanguage={toggleLanguage}
        callState={callState}
        PRODUCTION_SERVER={PRODUCTION_SERVER}
        LOCAL_WIFI_SERVER={LOCAL_WIFI_SERVER}
      />

      {/* 2. Top Visualizer Area: Orb + Animated Multi-Bar Waveform */}
      <View style={styles.visualizerArea}>
        <CircularWaveform
          callState={callState}
          isRecording={isRecording}
          isAiSpeaking={isAiSpeaking}
        />
        <VoiceVisualizer
          isActive={isActive}
          isRecording={isRecording}
          isAiSpeaking={isAiSpeaking}
          audioLevel={audioLevel}
        />
      </View>

      {/* 3. Connection Button */}
      <ConnectButton
        callState={callState}
        latencyMs={latencyMs}
        onStartCall={startCall}
        onEndCall={endCall}
      />

      {/* 4. Quick Order Shortcuts Bar */}
      <ShortcutsBar
        isActive={isActive}
        onSelectShortcut={(text) => sendTextMessage(text)}
      />

      {/* 5. Live Conversation Stream */}
      <ConversationPanel
        transcript={transcript}
        callState={callState}
        isAiSpeaking={isAiSpeaking}
        isRecording={isRecording}
      />

      {/* 6. Floating Control Bar */}
      <ControlBar
        callState={callState}
        isRecording={isRecording}
        cartCount={cartItems.reduce((sum, i) => sum + (i.quantity || 1), 0)}
        onToggleRecording={toggleRecording}
        onOpenMenu={() => setIsCatalogOpen(true)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenDTMF={() => setIsDTMFOpen(true)}
        onSendText={(text) => sendTextMessage(text)}
      />

      {/* 7. Interactive Modals */}
      <MenuCatalogModal
        isOpen={isCatalogOpen}
        onClose={() => setIsCatalogOpen(false)}
        catalog={catalog}
        onSelectItem={(dishName, qty) => askForDish(dishName, qty)}
        activeLanguage={activeLanguage}
      />

      <LiveCartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cartItems}
        cartTotal={cartTotal}
        deliveryAddress={deliveryAddress}
        onConfirmOrder={() => sendTextMessage('Yes confirm order')}
        onModifyItem={(dishName, delta) => {
          if (delta > 0) askForDish(dishName, 1);
          else sendTextMessage(`remove 1 ${dishName}`);
        }}
      />

      <DTMFKeypadModal
        isOpen={isDTMFOpen}
        onClose={() => setIsDTMFOpen(false)}
        onSendDigit={(digit) => {
          sendDTMFDigit(digit);
          setIsDTMFOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <VoiceSessionProvider>
      <MainVoiceScreen />
    </VoiceSessionProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  visualizerArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
});
