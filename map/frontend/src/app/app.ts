/**
 * @fileoverview Root component of the map app.
 *
 * Usage: bootstrapped in `main.ts`; renders the routed page (see `app.routes.ts`).
 */

import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Root shell that hosts the router outlet. */
@Component({
  imports: [RouterOutlet],
  selector: 'map-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {}
