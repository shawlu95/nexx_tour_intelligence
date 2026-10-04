import { LegalDoc } from '../../../components/Legal';
import { BackLink, Screen, TabHeader } from '../../../components/ui';

export default function Terms() {
  return (
    <Screen tab>
      <TabHeader />
      <BackLink />
      <LegalDoc doc="terms" />
    </Screen>
  );
}
