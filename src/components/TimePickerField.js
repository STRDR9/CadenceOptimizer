import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';

/**
 * TimePickerField — reusable wheel time entry.
 *
 * Tapping the field opens a bottom-sheet with snapping scroll wheels
 * (no keyboard, no manual formatting). Emits the SAME colon-formatted
 * string the rest of the app already stores/parses:
 *   - mode="ms"  -> "M:SS"   (e.g. "25:30", "9:05")
 *   - mode="hms" -> "H:MM:SS" (e.g. "1:55:30")
 * An all-zero selection emits "" so the field reads as "unset".
 *
 * Props:
 *   value        current colon string ("" when unset)
 *   onChange     (str) => void
 *   mode         "ms" | "hms"                 (default "ms")
 *   label        optional left-side label -> inline row layout ("5K")
 *   unit         optional trailing unit shown in the field ("/km") — NOT stored
 *   placeholder  text shown when value is empty
 *   title        modal header title (defaults to label or "Set time")
 */

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PAD = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2; // center the selected row

const pad2 = (n) => String(n).padStart(2, '0');
const range = (n) => Array.from({ length: n }, (_, i) => i);

// Parse a stored string into {h, m, s}. Tolerates "", "MM:SS", "H:MM:SS".
function parseParts(value) {
  const parts = String(value || '')
    .trim()
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return { h: 0, m: 0, s: 0 };
  if (parts.length === 3) return { h: parts[0], m: parts[1], s: parts[2] };
  if (parts.length === 2) return { h: 0, m: parts[0], s: parts[1] };
  if (parts.length === 1) return { h: 0, m: 0, s: parts[0] };
  return { h: 0, m: 0, s: 0 };
}

// Build the emitted string; all-zero -> "" (unset).
function formatParts({ h, m, s }, mode) {
  if (h === 0 && m === 0 && s === 0) return '';
  if (mode === 'hms') return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${m}:${pad2(s)}`; // minutes unpadded to match existing storage
}

// One snapping scroll wheel column.
function WheelColumn({ data, value, onChange, formatItem }) {
  const ref = useRef(null);
  const startIndex = Math.max(0, data.indexOf(value));
  const [centerIndex, setCenterIndex] = useState(startIndex);

  useEffect(() => {
    // Jump to the current value once laid out.
    const t = setTimeout(() => {
      ref.current?.scrollTo({ y: startIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clampIndex = (y) =>
    Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));

  return (
    <View style={styles.wheel}>
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={(e) => setCenterIndex(clampIndex(e.nativeEvent.contentOffset.y))}
        onMomentumScrollEnd={(e) => {
          const i = clampIndex(e.nativeEvent.contentOffset.y);
          onChange(data[i]);
        }}
        contentContainerStyle={{ paddingVertical: PAD }}
      >
        {data.map((item, i) => (
          <View key={item} style={styles.wheelItem}>
            <Text
              style={i === centerIndex ? styles.wheelTextActive : styles.wheelText}
            >
              {formatItem(item)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function TimePickerField({
  value,
  onChange,
  mode = 'ms',
  label,
  unit,
  placeholder = 'Tap to set',
  title,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ h: 0, m: 0, s: 0 });

  const openSheet = () => {
    setDraft(parseParts(value));
    setOpen(true);
  };

  const confirm = () => {
    onChange(formatParts(draft, mode));
    setOpen(false);
  };

  const displayValue = value
    ? `${value}${unit ? ` ${unit}` : ''}`
    : placeholder;

  const Field = (
    <TouchableOpacity
      style={[styles.field, label ? styles.fieldInline : null]}
      onPress={openSheet}
      activeOpacity={0.7}
    >
      <Text style={value ? styles.fieldValue : styles.fieldPlaceholder}>
        {displayValue}
      </Text>
    </TouchableOpacity>
  );

  return (
    <>
      {label ? (
        <View style={styles.row}>
          <Text style={styles.rowLabel}>{label}</Text>
          {Field}
        </View>
      ) : (
        Field
      )}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlayTap}
            activeOpacity={1}
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={hit}>
                <Text style={styles.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>
                {title || label || 'Set time'}
              </Text>
              <TouchableOpacity onPress={confirm} hitSlop={hit}>
                <Text style={styles.done}>Done</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.wheels}>
              {/* center selection band */}
              <View pointerEvents="none" style={styles.selectionBand} />

              {mode === 'hms' && (
                <>
                  <WheelColumn
                    data={range(10)}
                    value={draft.h}
                    onChange={(h) => setDraft((d) => ({ ...d, h }))}
                    formatItem={(n) => String(n)}
                  />
                  <Text style={styles.colon}>:</Text>
                </>
              )}

              <WheelColumn
                data={mode === 'hms' ? range(60) : range(100)}
                value={draft.m}
                onChange={(m) => setDraft((d) => ({ ...d, m }))}
                formatItem={(n) => (mode === 'hms' ? pad2(n) : String(n))}
              />
              <Text style={styles.colon}>:</Text>
              <WheelColumn
                data={range(60)}
                value={draft.s}
                onChange={(s) => setDraft((d) => ({ ...d, s }))}
                formatItem={pad2}
              />
            </View>

            <View style={styles.captions}>
              {mode === 'hms' && <Text style={styles.caption}>HR</Text>}
              <Text style={styles.caption}>MIN</Text>
              <Text style={styles.caption}>SEC</Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const hit = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  // Closed field
  field: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  fieldInline: { flex: 1 },
  fieldValue: {
    fontSize: 16,
    fontFamily: 'Archivo_600SemiBold',
    color: '#0A0A0A',
  },
  fieldPlaceholder: {
    fontSize: 16,
    fontFamily: 'Archivo_400Regular',
    color: '#999',
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  rowLabel: {
    fontSize: 14,
    fontFamily: 'Archivo_600SemiBold',
    color: '#0A0A0A',
    width: 100,
  },

  // Sheet
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#0A0A0A',
    paddingBottom: 34,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E5E5E5',
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: 'Archivo_700Bold',
    color: '#0A0A0A',
    letterSpacing: 0.5,
  },
  cancel: { fontSize: 15, fontFamily: 'Archivo_500Medium', color: '#999' },
  done: { fontSize: 15, fontFamily: 'Archivo_700Bold', color: '#0A0A0A' },

  // Wheels
  wheels: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: WHEEL_HEIGHT,
    marginTop: 8,
  },
  wheel: { width: 72, height: WHEEL_HEIGHT },
  wheelItem: { height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' },
  wheelText: {
    fontSize: 20,
    fontFamily: 'Archivo_400Regular',
    color: '#C4C4C4',
  },
  wheelTextActive: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: '#0A0A0A',
  },
  colon: {
    fontSize: 24,
    fontFamily: 'Archivo_700Bold',
    color: '#0A0A0A',
    marginHorizontal: 2,
  },
  selectionBand: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: PAD,
    height: ITEM_HEIGHT,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#00FF9D',
  },
  captions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  caption: {
    width: 74,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Archivo_600SemiBold',
    color: '#999',
    letterSpacing: 1,
  },
});
