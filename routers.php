<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\BlueprintFramework\Extensions\{identifier};
use Pterodactyl\Http\Middleware\Activity\ServerSubject;
use Pterodactyl\Http\Middleware\Api\Client\Server\ResourceBelongsToServer;
use Pterodactyl\Http\Middleware\Api\Client\Server\AuthenticateServerAccess;

Route::group([
    'prefix' => '/servers/{server}',
    'middleware' => [
        ServerSubject::class,
        AuthenticateServerAccess::class,
        ResourceBelongsToServer::class,
    ],
], function () {
    Route::group(['prefix' => '/split'], function () {
        Route::get('/',         [{identifier}\SplitController::class, 'index']);
        Route::post('/',        [{identifier}\SplitController::class, 'store']);
        Route::put('/{uuid}',   [{identifier}\SplitController::class, 'update']);
        Route::delete('/{uuid}', [{identifier}\SplitController::class, 'delete']);
    });
});

