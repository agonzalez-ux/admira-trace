"use client";

export default function WhatsAppButton({
  phone,
  text,
  label = "Enviar foto QR por WhatsApp",
}: {
  phone: string;
  text: string;
  label?: string;
}) {
  const url = `https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(text)}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 bg-[#25D366] hover:brightness-95 text-white text-xs font-medium rounded-lg px-3 py-2"
    >
      💬 {label}
    </a>
  );
}
