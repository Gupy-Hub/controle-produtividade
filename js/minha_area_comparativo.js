const MA_Comparativo = {
    atualizar: async function(dadosFinais, viewingTime, targetName, inicio, fim) {
        const cardL = document.getElementById('card-comp-left');
        const cardR = document.getElementById('card-comp-right');
        const labelL = document.getElementById('label-media-selecionada');
        const labelR = document.getElementById('label-media-benchmark');
        const valL = document.getElementById('comp-media-user');
        const valR = document.getElementById('comp-media-time');
        const elMsg = document.getElementById('comp-mensagem');

        // Se os elementos não existirem (aba fechada ou erro de HTML), para aqui
        if(!cardL || !valL) return;

        // 1. Busca dados gerais para calcular a "Média da Equipa" (Benchmark)
        const { data: all } = await _supabase
            .from('producao')
            .select('*')
            .gte('data_referencia', inicio)
            .lte('data_referencia', fim);
        
        // CORREÇÃO: Usa MA_Diario em vez de MA_Geral
        const norm = MA_Diario.normalizarDadosPorNome(all || []);
        
        let sumMedias = 0;
        let cntDias = 0;
        
        // Calcula a média diária da equipe (Média das médias)
        Object.values(norm).forEach(diaObj => {
            const arr = Object.values(diaObj);
            const tot = arr.reduce((a, b) => a + b.quantidade, 0);
            const headCount = arr.filter(p => p.quantidade > 0).length; // Conta apenas quem produziu
            
            if(headCount > 0) { 
                sumMedias += (tot / headCount); 
                cntDias++; 
            }
        });
        const mediaGeral = cntDias ? Math.round(sumMedias / cntDias) : 0;
        
        // 2. Calcula a Média do Usuário (ou do Time, se for Gestora vendo Time)
        // Usa os dadosFinais que já vêm filtrados do Main
        const diasTrabUser = dadosFinais.filter(d => d.quantidade > 0);
        const totUser = diasTrabUser.reduce((a, b) => a + b.quantidade, 0);
        const mediaUser = diasTrabUser.length ? Math.round(totUser / diasTrabUser.length) : 0;

        // 3. Define os Valores e Labels baseado na Visão (Time vs Individual)
        valL.innerText = mediaUser;
        
        if (viewingTime) {
            // Gestora vendo Time: Compara Média do Time (Esq) vs Meta 650 (Dir)
            valR.innerText = 650;
            labelL.innerText = "Média da Equipa";
            labelR.innerText = "Meta Esperada";
        } else {
            // Individual: Compara Média Pessoal (Esq) vs Média da Equipa (Dir)
            valR.innerText = mediaGeral;
            labelL.innerText = `Média ${targetName}`;
            labelR.innerText = "Média Geral da Equipa";
        }

        const valReference = viewingTime ? 650 : mediaGeral;

        // 4. Estilização do Card da Esquerda (Usuário/Foco)
        if (mediaUser < valReference) {
            // Abaixo da média/meta: Vermelho
            cardL.className = "flex-1 bg-rose-500 border border-rose-600 rounded-3xl p-8 text-center shadow-lg relative overflow-hidden transition-colors duration-300 text-white";
            labelL.className = "block text-xs font-bold text-rose-200 uppercase tracking-widest mb-4";
        } else {
            // Acima ou igual: Azul
            cardL.className = "flex-1 bg-gradient-to-br from-blue-600 to-indigo-700 border border-transparent rounded-3xl p-8 text-center shadow-xl relative overflow-hidden transition-colors duration-300 text-white";
            labelL.className = "block text-xs font-bold text-blue-200 uppercase tracking-widest mb-4";
        }

        // 5. Estilização do Card da Direita (Referência)
        cardR.className = "flex-1 bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm relative overflow-hidden transition-colors duration-300";
        labelR.className = "block text-xs font-bold text-slate-400 uppercase tracking-widest mb-4";
        valR.className = "text-5xl font-black text-slate-700 tracking-tighter mb-2";

        // 6. Mensagem de Feedback
        const diff = mediaUser - valReference;
        if (diff > 0) {
            elMsg.innerHTML = `<span class="text-emerald-600 font-black text-xl">+${diff}</span> <span class="text-slate-400 text-sm font-normal">acima do esperado</span>`;
        } else if (diff < 0) {
            elMsg.innerHTML = `<span class="text-rose-500 font-black text-xl">${diff}</span> <span class="text-slate-400 text-sm font-normal">abaixo do esperado</span>`;
        } else {
            elMsg.innerHTML = `<span class="text-slate-500">Exatamente na média.</span>`;
        }
    }
};