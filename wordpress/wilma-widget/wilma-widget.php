<?php
/**
 * Plugin Name:       Wilma – KI-Büroassistentin
 * Description:       Bindet das Wilma-Chatwidget unten rechts auf allen Seiten ein.
 * Version:           1.0.0
 * Requires at least: 5.0
 * Requires PHP:      7.0
 * Author:            Future AI Solutions
 */

// Direktaufruf der Datei abweisen.
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Adresse der Wilma-App – hier die eigene eintragen, ohne Schrägstrich
 * am Ende. Nach einem Deploy auf Vercel steht sie dort im Projekt unter
 * "Domains".
 */
const WILMA_APP_URL = 'https://IHRE-APP.vercel.app';

add_action('wp_enqueue_scripts', function () {
    // Im Fußbereich laden: Das Widget ist nichts, was den Seitenaufbau
    // aufhalten darf. Ohne Versionsnummer, damit WordPress keine
    // "?ver="-Endung anhängt – wie lange zwischengespeichert wird,
    // entscheidet die App selbst über ihre Kopfzeilen.
    wp_enqueue_script(
        'wilma-widget',
        WILMA_APP_URL . '/widget.js',
        array(),
        null,
        true
    );
});
