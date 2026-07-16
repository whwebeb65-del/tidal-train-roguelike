import { GameApp } from './app/GameApp';
import { requireElement } from './app/dom';
import './styles.css';

const root = requireElement<HTMLDivElement>(document, '#app');
const game = GameApp.createBrowser(root);
void game.start();
