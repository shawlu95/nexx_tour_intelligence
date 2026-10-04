// Privacy Policy and Terms, shown in the app (Profile → Privacy & data, and the
// sign-in screen). Drafts: they must be reviewed by counsel, name the operating
// entity and a privacy contact, and be published at a public URL before release.
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './ui';

export type LegalDocName = 'privacy' | 'terms';

interface Section {
  heading: string;
  body: string;
}

const UPDATED = 'October 3, 2026';

const PRIVACY: Section[] = [
  {
    heading: 'Before release',
    body: 'This draft must be replaced with a reviewed policy, published at a public web address, that names the company operating NORA and a working privacy contact.',
  },
  {
    heading: 'Data NORA uses',
    body: 'Your name, email address and sign-in method; a location reading, only while you ask NORA to find the home; the property address you confirm; your voice recording or typed note; the transcript, note, your edits, priorities and rankings; and a notification token if you allow notifications.',
  },
  {
    heading: 'How it is used',
    body: 'To identify the home you toured, transcribe and organize your reaction, answer your questions about your homes, rank them for you, keep your notes in sync, and keep the service secure and reliable.',
  },
  {
    heading: 'AI processing',
    body: 'Only with your permission, NORA sends your recording to AssemblyAI to transcribe it, and your transcript or typed note with the confirmed address to Anthropic (Claude) to write the note, ask a follow-up question and rank your homes. You can turn this off at any time in Privacy & data; nothing new is sent after that.',
  },
  {
    heading: 'Other service providers',
    body: 'Supabase stores your account and notes. RentCast looks up public facts (beds, baths, size, price) for the address you confirm. Apple Maps finds nearby addresses and makes the street-level picture of each home, on your phone.',
  },
  {
    heading: 'Location and audio',
    body: 'Location is used only while you ask NORA to find the home. NORA saves the address you confirm and the home’s map position, not your raw GPS readings. Original audio is deleted from NORA’s storage as soon as it is transcribed, and AssemblyAI’s copy of the transcript is deleted right after. Your transcript and note stay until you delete them.',
  },
  {
    heading: 'Agent sharing',
    body: 'No agent can see anything by default. A note you share by link can be read by anyone who has the link, until you revoke it or it expires after 90 days.',
  },
  {
    heading: 'Your choices',
    body: 'Type an address instead of sharing your location, type a note instead of using the microphone, withdraw AI permission, revoke share links, download your data, or permanently delete your account and data, all from inside the app.',
  },
  {
    heading: 'Advertising and tracking',
    body: 'NORA does not sell personal information, show third-party advertising, or track you across other companies’ apps or websites.',
  },
];

const TERMS: Section[] = [
  {
    heading: 'A memory and decision tool',
    body: 'NORA helps you capture and organize your own reactions to homes. AI-written notes, rankings, property facts and suggestions can be incomplete or wrong. Check them before you rely on them or share them.',
  },
  {
    heading: 'Not professional advice',
    body: 'NORA does not replace inspections, disclosures, appraisals, title review, lending or legal advice, or the judgment of your licensed real-estate professionals.',
  },
  {
    heading: 'Your content and sharing',
    body: 'You control the notes you add and the links you share. Don’t record other people without their permission. Revoking a link stops future access but can’t undo what someone has already seen.',
  },
  {
    heading: 'Before release',
    body: 'These terms must be reviewed by counsel and name the operating company, a support contact, and the dispute and governing-law terms.',
  },
];

export const LEGAL_TITLES: Record<LegalDocName, string> = { privacy: 'NORA Privacy Policy', terms: 'NORA Terms' };

/** The text of the Privacy Policy or the Terms, with the mockup's "Draft for review" header. */
export function LegalDoc({ doc }: { doc: LegalDocName }) {
  const sections = doc === 'privacy' ? PRIVACY : TERMS;
  return (
    <View style={s.root}>
      <View style={s.heading}>
        <Text style={s.eyebrow}>DRAFT FOR REVIEW</Text>
        <Text style={s.title} accessibilityRole="header">
          {LEGAL_TITLES[doc]}
        </Text>
        <Text style={s.updated}>Draft · Updated {UPDATED}</Text>
      </View>
      {sections.map((sec) => (
        <View key={sec.heading} style={s.section}>
          <Text style={s.sectionTitle}>{sec.heading}</Text>
          <Text style={s.body}>{sec.body}</Text>
        </View>
      ))}
    </View>
  );
}

/** The Privacy Policy or Terms in a sheet, for places outside the Profile tab (sign-in, consent). */
export function LegalModal({ doc, onClose }: { doc: LegalDocName | null; onClose: () => void }) {
  return (
    <Modal visible={doc !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modal} edges={['top', 'bottom']}>
        <View style={s.modalBar}>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={10}>
            <Text style={s.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.modalBody}>{doc ? <LegalDoc doc={doc} /> : null}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  modalBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 12 },
  done: { fontSize: 17, fontWeight: '600', color: colors.accent },
  modalBody: { padding: 20, paddingTop: 4 },
  root: { gap: 18 },
  heading: { gap: 6 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: colors.warn },
  title: { fontSize: 26, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  updated: { fontSize: 13, color: colors.ink3 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink2 },
});
