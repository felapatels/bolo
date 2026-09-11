import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { AppFonts } from '@/constants/fonts';
import { BADGE } from '@/lib/ticketStock';

/** The existing brass All-Access plate, shared by journey stops and zone cards. */
export function JourneyAllAccessBadge({ testID }: { testID: string }) {
  return (
    <View testID={testID} style={styles.chip}>
      <Feather name="star" size={9} color={BADGE.ink} />
      <Text style={styles.text}>ALL-ACCESS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3,
    borderRadius: 999, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: BADGE.brassBg, borderColor: BADGE.brassEdge,
  },
  text: { fontFamily: AppFonts.extrabold, fontSize: 8, letterSpacing: 0.8, color: BADGE.ink },
});
