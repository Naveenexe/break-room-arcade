import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="text-center bg-surface p-8 rounded-modal border-2 border-line max-w-md shadow-2xl">
        <div className="text-6xl mb-4">🕹️💥</div>
        <h1 className="text-4xl font-black font-heading text-text">404</h1>
        <h2 className="text-xl font-bold font-heading text-primary mt-1">Level Not Found</h2>
        <p className="text-sm text-text-muted mt-2">
          Looks like this arcade cabinet is unplugged or the page does not exist.
        </p>
        <Link to="/" className="inline-block mt-6">
          <Button variant="primary">
            <Home className="w-4 h-4 mr-2" />
            Back to Arcade
          </Button>
        </Link>
      </div>
    </div>
  );
};
