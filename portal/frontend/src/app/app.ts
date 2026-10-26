/**
 * @fileoverview Root component of the portal app.
 *
 * Currently renders the Angular CLI starter page (`app.html`), which is a placeholder.
 * Usage: bootstrapped in `main.ts`.
 */

import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root shell of the portal; hosts the router outlet. */
@Component({
  imports: [RouterOutlet],
  selector: 'portal-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('portal-frontend');
}
