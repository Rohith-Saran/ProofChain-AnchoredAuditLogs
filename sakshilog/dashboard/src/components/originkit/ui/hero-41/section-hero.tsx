// Delivered by Originkit · stack: nextjs · styling: tailwind
/* eslint-disable */
// @ts-nocheck
"use client"
import ParticleSphere from "@/components/originkit/ui/hero-41/particlesphere";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function SectionHero() {
  return (
    <div className="hero-41">
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <symbol id="chev" viewBox="0 0 6.66667 11.6667" fill="none">
          <path
            d="M0.833333 10.8333L5.83333 5.83333L0.833333 0.833333"
            stroke="currentColor"
            strokeWidth="1.66667"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </symbol>
      </svg>
      <section className="hero is-live">
        <div className="hero__stars" aria-hidden="true" />
        <div className="sphere sphere--left" aria-hidden="true">
          <div className="sphere__core" id="sphere-left">
            {/* Decorative WebGL; without WebGL the hero still renders, just without the spheres. */}
            <ErrorBoundary silent>
              <ParticleSphere
                sphereColor="#e8a86e"
                cursorRadiusUI={180}
                style={{ width: "100%", height: "100%" }}
              />
            </ErrorBoundary>
          </div>
        </div>
        <div className="sphere sphere--right" aria-hidden="true">
          <div className="sphere__core" id="sphere-right">
            {/* Decorative WebGL; without WebGL the hero still renders, just without the spheres. */}
            <ErrorBoundary silent>
              <ParticleSphere
                sphereColor="#e8a86e"
                cursorRadiusUI={180}
                style={{ width: "100%", height: "100%" }}
              />
            </ErrorBoundary>
          </div>
        </div>
        <div className="hero__fade" aria-hidden="true" />
        <header className="nav">
          <a className="brand" href="#/" aria-label="SakshiLog home">
            <img className="brand__mark" src="/originkit/hero-41/logo.webp" alt="" width={53.5} height={53.5} />
            <span className="brand__name">SakshiLog</span>
          </a>
          <nav className="nav__links" aria-label="Primary">
            <a href="#/live">Live Console</a>
            <a href="#/attacks">Attacks</a>
            <a href="#/ai">AI Analyst</a>
          </nav>
          <a className="btn btn--ghost" href="#/evidence">
            {" "}
            Evidence Pack{" "}
            <svg className="chev" width="6.667" height="11.667" aria-hidden="true">
              <use href="#chev" />
            </svg>
          </a>
        </header>
        <div className="hero__content">
          <div className="badge">
            <span className="badge__text">The Big Hack 2.0 · Cybersecurity &amp; Blockchain</span>
          </div>
          <div className="hero__copy">
            <h1 className="hero__title">
              Security Logs the Attacker Can&apos;t Erase, Even With Root Access
            </h1>
            <p className="hero__sub">
              SakshiLog pins every log batch to a blockchain, so any edit, deletion or insertion is caught
              and pinpointed, and an AI that can only say what the chain can prove writes the report.
            </p>
          </div>
          <div className="hero__actions">
            <a className="btn btn--primary" href="#/attacks/6">
              {" "}
              Watch the Attack Demo{" "}
              <svg className="chev" width="6.667" height="11.667" aria-hidden="true">
                <use href="#chev" />
              </svg>
            </a>
            <a className="btn btn--soft" href="#/live">
              {" "}
              Open Live Console{" "}
              <svg className="chev" width="8" height="14" aria-hidden="true">
                <use href="#chev" />
              </svg>
            </a>
          </div>
        </div>
        <img className="hero__mesh" src="/originkit/hero-41/top-mesh.png" alt="" aria-hidden="true" />
        <span className="glow glow--l1" aria-hidden="true" />
        <span className="glow glow--l2" aria-hidden="true" />
        <span className="glow glow--r1" aria-hidden="true" />
        <span className="glow glow--r2" aria-hidden="true" />
      </section>
    </>
    </div>
  );
}
