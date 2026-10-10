import Link from "next/link";
import { Container } from "@/components/ui/Section";

export default function NotFound() {
  return (
    <Container className="py-24">
      <p className="eyebrow">404</p>
      <h1 className="display mt-2 text-7xl">Te saliste del loop.</h1>
      <Link href="/" className="btn mt-8">Volver al inicio</Link>
    </Container>
  );
}
