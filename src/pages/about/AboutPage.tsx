import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Award, BookOpen } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="flex-1 max-w-4xl mx-auto py-6 px-4 space-y-8">
      <Link to="/" className="inline-flex items-center text-sm font-semibold text-primary hover:underline">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Arcade
      </Link>

      <div className="bg-surface p-6 md:p-8 rounded-modal border-2 border-line space-y-6">
        <div>
          <h1 className="text-3xl font-black font-heading text-text">About Break Room Arcade</h1>
          <p className="text-text-muted mt-2">
            Break Room Arcade was designed specifically for friends, teammates, and colleagues to enjoy quick, high-energy party games together during breaks.
          </p>
        </div>

        {/* Six Games Rules */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold font-heading text-text flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Game Rules & Scoring
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-pictionary">🎨 Pictionary</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                The drawer picks one of 3 secret words and sketches it live on the shared canvas. Guessers race to type the correct answer. Points decrease as time ticks down, with bonus points for the first correct guess!
              </p>
            </div>

            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-charades">🎭 Emoji Charades</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                The actor receives a secret movie, office phrase, or food and must express it using <em>only</em> emojis. No letters or words allowed!
              </p>
            </div>

            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-wordchain">🔗 Word Chain Blitz</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Turn-based elimination. Submit a word starting with the last letter of the previous word. Turn timers shrink by 0.5s with every valid word down to 4s. Last player standing wins!
              </p>
            </div>

            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-reaction">⚡ Reaction Duel</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Everyone waits for the screen to turn green. When it does, tap as fast as possible! Measured locally in milliseconds using requestAnimationFrame for zero-lag fairness. False starts score zero.
              </p>
            </div>

            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-typing">🏁 Typing Race</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Type the funny passage accurately to race your avatar across the track. Correct keystrokes advance your lane; typos must be corrected before moving forward.
              </p>
            </div>

            <div className="p-4 rounded-card bg-surface-raised border border-line">
              <h3 className="font-heading font-bold text-game-quiz">💡 Quick Draw Quiz</h3>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                Speed multiple choice. Lock in your answer quickly to earn up to 200 points per question. Build streaks for bonus multiplier points!
              </p>
            </div>
          </div>
        </div>

        {/* Privacy Note (NFR-6) */}
        <div className="p-4 rounded-card bg-surface-raised border border-line space-y-2">
          <h2 className="text-base font-bold font-heading text-text flex items-center gap-2">
            <Shield className="w-4 h-4 text-success" />
            Privacy & Data Policy
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Break Room Arcade values your privacy. We store only your email, display name, chosen mascot avatar, and gameplay scores for active sessions. We do not use third-party tracking cookies or advertising pixels.
          </p>
        </div>

        {/* Licenses & Credits */}
        <div className="p-4 rounded-card bg-surface-raised border border-line space-y-2">
          <h2 className="text-base font-bold font-heading text-text flex items-center gap-2">
            <Award className="w-4 h-4 text-warn" />
            Credits & Licenses
          </h2>
          <p className="text-xs text-text-muted leading-relaxed">
            Fonts: Fredoka and Figtree (OFL), Atkinson Hyperlegible (Braille Institute OFL). Word list: ENABLE English dictionary (Public Domain). Audio synthesized dynamically with Web Audio API.
          </p>
        </div>
      </div>
    </div>
  );
};

