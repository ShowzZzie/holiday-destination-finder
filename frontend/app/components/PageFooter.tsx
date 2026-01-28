'use client';

import { useLanguage } from '@/app/contexts/LanguageContext';

const PLACEHOLDER = '{{NAME}}';

/** Override via .env.local: NEXT_PUBLIC_AUTHOR_NAME, NEXT_PUBLIC_GITHUB_USER, NEXT_PUBLIC_GITHUB_REPO */
const AUTHOR_NAME = process.env.NEXT_PUBLIC_AUTHOR_NAME ?? 'ShowzZzie';
const GITHUB_USER = process.env.NEXT_PUBLIC_GITHUB_USER ?? 'ShowzZzie';
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO ?? 'ShowzZzie/holiday-destination-finder';

const PROFILE_URL = `https://github.com/${GITHUB_USER}`;
const REPO_URL = `https://github.com/${GITHUB_REPO}`;
const ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`;

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

const linkClass =
  'font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 underline underline-offset-2 transition-colors';

export default function PageFooter() {
  const { t } = useLanguage();
  const templ = t('madeBy', { name: PLACEHOLDER });
  const [before, after] = templ.split(PLACEHOLDER);

  return (
    <footer className="mt-10 sm:mt-14 pt-6 sm:pt-8 border-t border-gray-200 dark:border-gray-700 text-center">
      <p className="text-sm text-gray-500 dark:text-gray-400 flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
        {before}
        <a
          href={PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 ${linkClass}`}
        >
          <GitHubIcon className="w-4 h-4 shrink-0" />
          {AUTHOR_NAME}
        </a>
        {after}
        <span className="mx-1 text-gray-400 dark:text-gray-500" aria-hidden>·</span>
        <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {t('reportBug')}
        </a>
        <span className="mx-1 text-gray-400 dark:text-gray-500" aria-hidden>·</span>
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {t('source')}
        </a>
      </p>
    </footer>
  );
}
