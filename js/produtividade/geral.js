// ARQUIVO: js/produtividade/geral.js
// ... (mantenha o início igual)

    // DENTRO DE renderizarTabela:
    // ...
        const htmlParts = lista.map(d => {
            const metaDia = d.meta_real; 
            const atingimento = (metaDia > 0 && d.totais.diasUteis > 0) 
                ? (d.totais.qty / (metaDia * d.totais.diasUteis)) * 100 
                : 0;
            
            // --- NOVO: Usa o módulo dedicado para Assertividade ---
            // Passamos os dados brutos (qtd e soma) para ele calcular e desenhar
            const htmlAssertividade = Produtividade.Assertividade 
                ? Produtividade.Assertividade.renderizarCelula(d.auditoria)
                : '-'; 
            // -----------------------------------------------------

            return `
            <tr class="hover:bg-slate-50 transition border-b border-slate-100 last:border-0 group text-xs text-slate-600">
                <td class="px-2 py-3 text-center bg-slate-50/30">
                    <input type="checkbox" class="check-user cursor-pointer" value="${d.usuario.id}">
                </td>
                <td class="px-2 py-3 text-center">
                     <button onclick="Produtividade.Geral.mudarFator('${d.usuario.id}', 0)" class="text-[10px] font-bold text-slate-400 hover:text-rose-500 border border-slate-200 rounded px-1 py-0.5 hover:bg-white" title="Zerar Fator">AB</button>
                </td>
                <td class="px-3 py-3 font-bold text-slate-700 group-hover:text-blue-600 transition cursor-pointer" onclick="Produtividade.Geral.filtrarUsuario('${d.usuario.id}', '${d.usuario.nome}')">
                    <div class="flex flex-col">
                        <span class="truncate" title="${d.usuario.nome}">${d.usuario.nome}</span>
                        <span class="text-[9px] text-slate-400 font-normal uppercase">${d.usuario.funcao || 'ND'}</span>
                    </div>
                </td>
                <td class="px-2 py-3 text-center font-mono">${d.totais.diasUteis.toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.fifo}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gt}</td>
                <td class="px-2 py-3 text-center text-slate-500">${d.totais.gp}</td>
                <td class="px-2 py-3 text-center bg-slate-50/50 text-slate-400 font-mono">${metaDia}</td>
                <td class="px-2 py-3 text-center font-bold text-slate-600 bg-slate-50/50">${(metaDia * d.totais.diasUteis).toLocaleString('pt-BR')}</td>
                <td class="px-2 py-3 text-center font-black text-blue-700 bg-blue-50/30 border-x border-blue-100 text-sm shadow-sm">
                    ${d.totais.qty.toLocaleString('pt-BR')}
                </td>
                <td class="px-2 py-3 text-center font-bold ${atingimento >= 100 ? 'text-emerald-600' : 'text-slate-500'}">
                    ${atingimento.toFixed(1)}%
                </td>
                <td class="px-2 py-3 text-center border-l border-slate-100">
                    ${htmlAssertividade}
                </td>
            </tr>`;
        });
// ... (mantenha o restante igual)