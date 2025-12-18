import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import axios from 'axios';

// Replace with your local machine's IP if testing on real device
const API_URL = 'http://localhost:8000/chat';

import Voice from '@react-native-voice/voice';


async function loadVoices() {
  const voices = await Speech.getAvailableVoicesAsync();

  console.log('Voices: ', voices);
  return voices;
}

export default function App() {
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollViewRef = useRef();
  // State to hold partial text results
  const [textToProcess, setTextToProcess] = useState('');

  useEffect(() => {
    (async () => {
      // expo-av permissions are still good to ask for, or use Voice permissions logic if strictly needed
      // usually Voice handles its own permissions on start, but good to be safe.
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone permission is required to use this app.');
      }
    })();

    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const onSpeechStart = (e) => {
    setIsRecording(true);
  };

  const onSpeechEnd = (e) => {
    setIsRecording(false);
    // After speech ends, if there's text to process, send it
    if (textToProcess.trim()) {
      sendTextToBackend(textToProcess);
    }
  };

  const onSpeechError = (e) => {
    console.log('onSpeechError: ', e);
    setIsRecording(false);
  };

  const onSpeechResults = (e) => {
    if (e.value && e.value.length > 0) {
      setTextToProcess(e.value[0]);
    }
  };

  async function startRecording() {
    try {
      setTextToProcess('');
      if (isRecording) {
        await stopRecording();
      }
      // Start recognizing English
      await Voice.start('en-US');
    } catch (e) {
      console.error(e);
    }
  }

  async function stopRecording() {
    try {
      await Voice.stop();
      setIsRecording(false);
    } catch (e) {
      console.error(e);
    }
  }

  async function sendTextToBackend(text) {
    if (!text || !text.trim()) return;

    setIsLoading(true);
    const userMsg = { id: Date.now(), text: text, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    setTextToProcess('');
    console.log('Sending text to backend: ', text);
    try {
      const response = await axios.post(API_URL, { text: text }, {
        headers: { 'Content-Type': 'application/json' },
      });

      console.log(response.data);

      const aiResponse = response.reply ?? response.data.reply;
      const aiMsg = { id: Date.now() + 1, text: aiResponse, sender: 'ai' };

      setMessages(prev => [...prev, aiMsg]);

      loadVoices();
      Speech.speak(aiResponse, {
        voice: 'com.apple.voice.super-compact.en-US.Samantha',
        pitch: 1.2,
      });

    } catch (error) {
      console.error('Error sending text:', error);
      Alert.alert('Error', 'Failed to connect to the tutor.');
      setMessages(prev => [...prev, { id: Date.now(), text: 'Error connecting to server.', sender: 'system' }]);
    } finally {
      setIsLoading(false);
    }
  }

  // Ref to hold latest text for access in timeout
  const textRef = useRef('');

  useEffect(() => {
    // Keep ref in sync
    textRef.current = textToProcess;
  }, [textToProcess]);

  const handlePressIn = () => {
    startRecording();
  };

  const handlePressOut = async () => {
    await stopRecording();
    setTimeout(() => {
      if (textRef.current) {
        sendTextToBackend(textRef.current);
      }
    }, 1000); // 1s delay to be safe
  };

  return (
    <LinearGradient
      colors={['#1a1a2e', '#16213e', '#0f3460']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AI Tutor</Text>
          <Text style={styles.headerSubtitle}>Improve your English naturally</Text>
        </View>

        <ScrollView
          style={styles.chatContainer}
          ref={scrollViewRef}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderText}>Tap the mic to start speaking!</Text>
            </View>
          )}
          {messages.map((msg) => (
            <View key={msg.id} style={[
              styles.messageBubble,
              msg.sender === 'user' ? styles.userBubble :
                msg.sender === 'system' ? styles.systemBubble : styles.aiBubble
            ]}>
              <Text style={msg.sender === 'user' ? styles.userText : styles.aiText}>
                {msg.text}
              </Text>
            </View>
          ))}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#e94560" />
              <Text style={styles.loadingText}>Tutor is thinking...</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordingButton]}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={isLoading}
          >
            <View style={styles.innerRecordButton} />
          </TouchableOpacity>
          <Text style={styles.instructionText}>
            {isRecording ? 'Release to Send' : 'Hold to Speak'}
          </Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 5,
  },
  chatContainer: {
    flex: 1,
    padding: 15,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
    opacity: 0.6,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 18,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 15,
    borderRadius: 20,
    marginBottom: 15,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#e94560',
    borderBottomRightRadius: 5,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderBottomLeftRadius: 5,
  },
  systemBubble: {
    alignSelf: 'center',
    backgroundColor: '#333',
  },
  userText: {
    color: '#fff',
    fontSize: 16,
  },
  aiText: {
    color: '#e0e0e0',
    fontSize: 16,
    lineHeight: 24,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    marginBottom: 20,
  },
  loadingText: {
    color: '#a0a0a0',
    marginLeft: 10,
    fontSize: 14,
  },
  footer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  recordingButton: {
    backgroundColor: 'rgba(233, 69, 96, 0.4)',
    borderColor: '#e94560',
    transform: [{ scale: 1.1 }],
  },
  innerRecordButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  instructionText: {
    color: '#a0a0a0',
    marginTop: 15,
    fontSize: 14,
  },
});
