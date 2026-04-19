import ScrollProgress from './components/ScrollProgress';
import Navbar         from './components/Navbar';
import Hero           from './components/Hero';
import Services       from './components/Services';
import Packages       from './components/Packages';
import WhyUs          from './components/WhyUs';
import Footer         from './components/Footer';
import ScrollToHash   from './components/ScrollToHash';

export default function Page() {
  return (
    <>
      {/* Handle scroll ke section setelah navigasi dari halaman lain */}
      <ScrollToHash />

      {/* Fixed scroll indicator at the very top */}
      <ScrollProgress />

      {/* Floating navbar */}
      <Navbar />

      {/* Page sections */}
      <main>
        <Hero />
        <Services />
        <Packages />
        <WhyUs />
      </main>

      <Footer />
    </>
  );
}
