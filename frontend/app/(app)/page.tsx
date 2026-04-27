import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">OpenPortfolio</h1>
        <p className="text-body-sm text-muted-foreground max-w-2xl">
          See what you actually own — including the parts that aren&rsquo;t on
          any brokerage.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-h3">Foundation ready</CardTitle>
          <CardDescription>
            shadcn/ui + Tailwind v4 wired against the brand tokens. Content
            comes next.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-body-sm text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Visit <code className="font-mono">/brand</code> for the brand
              identity reference.
            </li>
            <li>
              Run <code className="font-mono">npm run storybook</code> for the
              component &amp; token playground.
            </li>
            <li>
              Pre-redesign routes preserved at{" "}
              <code className="font-mono">/legacy/*</code>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
