export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center page-x-pad bg-neutral-50">
      {children}
    </div>
  );
}
