import { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <div className="border-b border-border bg-gradient-to-b from-background to-background/40">
      <div className="px-6 lg:px-10 py-8 lg:py-10 max-w-[1600px] mx-auto flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2 min-w-0">
          {eyebrow ? (
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="font-display text-3xl md:text-[2.4rem] font-semibold tracking-tight leading-[1.1]">
            {title}
          </h1>
          {description ? (
            <p className="text-sm md:text-[15px] text-muted-foreground max-w-2xl leading-relaxed">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
      </div>
    </div>
  );
}
