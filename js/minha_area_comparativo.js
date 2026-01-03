const MA_Comparativo = {
    atualizar: async function(dadosFinais, viewingTime, targetName, inicio, fim) {
        const cardL = document.getElementById('card-comp-left');
        const cardR = document.getElementById('card-comp-right');
        const labelL = document.getElementById('label-media-selecionada');
        const labelR = document.getElementById('label-media-benchmark');
        const valL = document.getElementById('comp-media-user');
        const valR = document.getElementById('comp-media-time');
        const elMsg = document.getElementById('comp-mensagem');

        if(!cardL || !valL) return;

        // Busca média geral para benchmarking
        const { data: all } = await _supabase.from('producao').select('*').gte('data_referencia', inicio).lte('data_referencia', fim);
        const norm = MA_Geral.normalizarDadosPorNome(all||[]);
        
        let sumMedias=0, cntDias=0;
        Object.values(norm).forEach(diaObj => {
            const arr = Object.values(diaObj);
            const tot = arr.reduce((a,b)=>a+b.quantidade,0);
            const headCount = arr.filter(p => p.quantidade > 0).length;
            if(headCount > 0) { sumMedias += (tot/headCount); cntDias++; }
        });
        const mediaGeral = cntDias ? Math.round(sumMedias/cntDias) : 0;
        
        // Média do Usuário (ou Seleção)
        const diasTrabUser = dadosFinais.filter(d => d.quantidade > 0);
        const totUser = diasTrabUser.reduce((a,b)=>a+b.quantidade,0);
        const mediaUser = diasTrabUser.length ? Math.round(totUser/diasTrabUser.length) : 0;

        valL.innerText = mediaUser;
        valR.innerText = viewingTime ? 650 : mediaGeral; 

        labelL.innerText = viewingTime ? "Média da Equipa" : `Média ${targetName}`;
        labelR.innerText = viewingTime ? "Meta Esperada" : "Média Geral da Equipa";

        // Estilização Esquerda
        if (mediaUser < 650) {
            cardL.className = "flex-1 bg-rose-500 border border-rose-600 rounded-3xl p-8 text-center shadow-lg relative overflow-hidden transition-colors duration-300 text-white";
            labelL.className = "block text-xs font-bold text-rose-200 uppercase tracking-widest mb-4";
        } else {
            cardL.className = "flex-1 bg-gradient-to-br from-blue-600 to-indigo-700 border border-transparent rounded-3xl p-8 text-center shadow-xl relative overflow-hidden transition-colors duration-300 text-white";
            labelL.className = "block text-xs font-bold text-blue-200 uppercase tracking-widest mb-4";
        }

        const valRight = viewingTime ? 650 : mediaGeral;
        
        // Estilização Direita
        cardR.className = "flex-1 bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm relative overflow-hidden transition-colors duration-300";
        labelR.className = "block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4";
        valR.className = "text-5xl font-black text-slate-700 tracking-tighter mb-2";

        const diff = mediaUser - valRight;
        if (diff > 0) elMsg.innerHTML = `<span class="text-emerald-600 font-black text-xl">+${diff}</span> <span class="text-slate-400 text-sm font-normal">acima do esperado</span>`;
        else if (diff < 0) elMsg.innerHTML = `<span class="text-rose-500 font-black text-xl">${diff}</span> <span class="text-slate-400 text-sm font-normal">abaixo do esperado</span>`;
        else elMsg.innerHTML = `<span class="text-slate-500">Exatamente na média.</span>`;
    }
};