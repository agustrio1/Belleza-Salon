export function PageStub({ title, note }: { title: string; note: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl md:text-4xl">{title}</h1>
      <p className="mt-3 text-plum-500">{note}</p>
    </section>
  );
}