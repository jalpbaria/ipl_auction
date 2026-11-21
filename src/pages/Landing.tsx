import { Footer } from '../components/landing/Footer';
import { FranchiseRoster } from '../components/landing/FranchiseRoster';
import { Hero } from '../components/landing/Hero';
import { Navbar } from '../components/landing/Navbar';
import { RuleBookModal } from '../components/landing/RuleBookModal';
import { RulesSection } from '../components/landing/RulesSection';
import { StrategicBlueprint } from '../components/landing/StrategicBlueprint';

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#070B14] text-[#E8ECF4]">
      <Navbar />
      <main>
        <Hero />
        <FranchiseRoster />
        <StrategicBlueprint />
        <RulesSection />
      </main>
      <Footer />
      <RuleBookModal />
    </div>
  );
}
